import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  isObjectRangeNotSatisfiableError,
  RangeNotSatisfiableException,
} from '../common/range-parser';
import { PrismaService } from '../prisma/prisma.service';
import { createImageProcessor } from './image-processing-policy';
import { ObjectStorageGateway, type CompletedMultipartPart } from './object-storage.gateway';
import { FileAccessService } from './file-access.service';
import {
  fileObjectSelect,
  type FileObjectRecord,
  type RenderableImageFileRecord,
} from './file-record.types';
import { FileUrlService } from './file-url.service';
import { ImageMetadataService } from './image-metadata.service';

const FILE_VIEW_URL_TTL_SECONDS = 3600;

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  constructor(
    private readonly prismaService: PrismaService,
    private readonly objectStorage: ObjectStorageGateway,
    private readonly fileAccess: FileAccessService,
    private readonly imageMetadata: ImageMetadataService,
    private readonly fileUrls: FileUrlService,
  ) {}

  async uploadFile(userId: string, groupId: string, file: Express.Multer.File) {
    await this.fileAccess.assertWritableGroup(groupId, userId);

    if (!file?.buffer?.length) {
      throw new BadRequestException('Upload file is required.');
    }

    this.assertFileTypeMatchesContent(file);

    const normalizedOriginalName = this.normalizeOriginalName(file.originalname);
    const storageKey = this.buildStorageKey(groupId, normalizedOriginalName);

    try {
      await this.objectStorage.put(
        storageKey,
        file.buffer,
        file.mimetype || 'application/octet-stream',
      );
    } catch (error) {
      this.logger.error(
        'file_upload_failed',
        JSON.stringify({
          userId,
          groupId,
          originalName: normalizedOriginalName,
          error: error instanceof Error ? error.message : 'Unknown upload error',
        }),
      );
      throw new ServiceUnavailableException('对象存储不可用，请检查 S3 配置或存储服务状态。');
    }

    let thumbnailStorageKey: string | null = null;
    let thumbnailSize: number | null = null;
    const isImage = file.mimetype.startsWith('image/') && file.mimetype !== 'image/svg+xml';
    let imageDimensions: { width: number; height: number } | null = null;

    if (isImage) {
      try {
        imageDimensions = await this.getImageDimensionsFromBuffer(file.buffer, file.mimetype);
      } catch (error) {
        this.logger.warn(
          'image_metadata_extraction_failed',
          JSON.stringify({
            storageKey,
            error: error instanceof Error ? error.message : 'Unknown',
          }),
        );
      }

      try {
        const thumbnailBuffer = await createImageProcessor(file.buffer)
          .resize({ width: 400, withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();

        thumbnailStorageKey = this.buildThumbnailStorageKey(storageKey);
        thumbnailSize = thumbnailBuffer.length;

        await this.objectStorage.put(thumbnailStorageKey, thumbnailBuffer, 'image/jpeg');
      } catch (error) {
        this.logger.warn(
          'thumbnail_generation_failed',
          JSON.stringify({
            storageKey,
            error: error instanceof Error ? error.message : 'Unknown',
          }),
        );
        thumbnailStorageKey = null;
      }
    }

    const created = await this.prismaService.fileObject.create({
      data: {
        groupId,
        uploaderId: userId,
        storageKey,
        thumbnailStorageKey,
        thumbnailSize,
        imageWidth: imageDimensions?.width ?? null,
        imageHeight: imageDimensions?.height ?? null,
        originalName: normalizedOriginalName || 'upload.bin',
        mimeType: file.mimetype || 'application/octet-stream',
        size: file.size,
      },
      select: fileObjectSelect,
    });

    this.logger.log(
      'file_uploaded',
      JSON.stringify({
        userId,
        groupId,
        fileId: created.id,
        originalName: created.originalName,
      }),
    );

    return this.serializeFileObject(created);
  }

  async getFileMetadata(userId: string, groupId: string, fileId: string) {
    const file = await this.getReadableFileOrThrow(groupId, fileId, userId);
    return this.serializeFileObject(file);
  }

  async assertAttachmentUsable(userId: string, groupId: string, fileId: string) {
    const file = await this.getReadableFileOrThrow(groupId, fileId, userId);

    if (file.groupId !== groupId) {
      throw new BadRequestException('Attachment file does not belong to this group.');
    }

    return file;
  }

  async getFileStream(userId: string, groupId: string, fileId: string, range?: string) {
    const file = await this.getReadableFileOrThrow(groupId, fileId, userId);

    try {
      const object = await this.objectStorage.get(file.storageKey, { range });

      return {
        file,
        stream: object.stream,
        contentLength: object.contentLength || file.size,
        contentRange: object.contentRange,
      };
    } catch (error) {
      const maybeAwsError = error as Error & {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (maybeAwsError.name === 'NoSuchKey' || maybeAwsError.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('File content not found.');
      }
      if (range && isObjectRangeNotSatisfiableError(error)) {
        throw new RangeNotSatisfiableException(file.size);
      }

      this.logger.error(
        'file_stream_failed',
        JSON.stringify({
          userId,
          groupId,
          fileId,
          error: maybeAwsError.message,
        }),
      );

      throw new ServiceUnavailableException('对象存储不可用，请稍后重试。');
    }
  }

  createFileAccessUrl(file: FileObjectRecord) {
    return this.fileUrls.content(file);
  }

  async createFileDownloadUrl(userId: string, groupId: string, fileId: string) {
    const file = await this.getReadableFileOrThrow(groupId, fileId, userId);
    const url = await this.createPresignedDownloadUrl(
      file.storageKey,
      file.mimeType,
      file.originalName,
      3600,
    );
    return { file, url };
  }

  async createFileViewUrl(userId: string, groupId: string, fileId: string) {
    const file = await this.getReadableFileOrThrow(groupId, fileId, userId);
    const url = await this.createPresignedViewUrl(
      file.storageKey,
      file.mimeType,
      FILE_VIEW_URL_TTL_SECONDS,
    );
    return {
      file,
      url,
      expiresAt: new Date(Date.now() + FILE_VIEW_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  createDirectFileAccessUrl(file: { id: string; groupId: string }) {
    return this.fileUrls.content(file);
  }

  createDirectFileMetadataUrl(file: { id: string; groupId: string }) {
    return this.fileUrls.metadata(file);
  }

  createThumbnailAccessUrl(file: { id: string; groupId: string }) {
    return this.fileUrls.thumbnail(file);
  }

  async getThumbnailStream(userId: string, groupId: string, fileId: string, ifNoneMatch?: string) {
    const file = await this.getReadableFileOrThrow(groupId, fileId, userId);

    const key = file.thumbnailStorageKey ?? file.storageKey;

    try {
      const object = await this.objectStorage.get(key, { ifNoneMatch });
      return {
        file,
        stream: object.stream,
        contentLength:
          object.contentLength ||
          (file.thumbnailStorageKey ? (file.thumbnailSize ?? undefined) : Number(file.size)),
        etag: object.etag,
        lastModified: object.lastModified,
      };
    } catch (error) {
      const maybeAwsError = error as Error & {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (maybeAwsError.$metadata?.httpStatusCode === 304) {
        return { file, notModified: true as const, etag: ifNoneMatch };
      }
      if (maybeAwsError.name === 'NoSuchKey' || maybeAwsError.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('File content not found.');
      }
      this.logger.error(
        'thumbnail_stream_failed',
        JSON.stringify({ userId, groupId, fileId, error: maybeAwsError.message }),
      );
      throw new ServiceUnavailableException('对象存储不可用，请稍后重试。');
    }
  }

  async getImageDimensionsFromBuffer(
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ width: number; height: number } | null> {
    return this.imageMetadata.fromBuffer(buffer, mimeType);
  }

  async getImageDimensionsFromS3Object(
    objectKey: string,
    mimeType: string,
  ): Promise<{ width: number; height: number } | null> {
    return this.imageMetadata.fromObject(objectKey, mimeType);
  }

  async resolveRenderableImageDimensions(
    file: RenderableImageFileRecord,
  ): Promise<{ width: number | null; height: number | null }> {
    return this.imageMetadata.resolve(file);
  }

  shouldExposeInlineThumbnail(
    mimeType: string,
    thumbnailStorageKey: string | null | undefined,
  ): boolean {
    return this.imageMetadata.shouldExposeThumbnail(mimeType, thumbnailStorageKey);
  }

  shouldGenerateThumbnail(mimeType: string): boolean {
    return this.imageMetadata.shouldGenerateThumbnail(mimeType);
  }

  private serializeFileObject(file: FileObjectRecord) {
    return {
      id: file.id,
      groupId: file.groupId,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: Number(file.size),
      width: file.imageWidth ?? null,
      height: file.imageHeight ?? null,
      createdAt: file.createdAt,
      contentUrl: this.createFileAccessUrl(file),
      metadataUrl: this.fileUrls.metadata(file),
      thumbnailUrl: this.shouldExposeInlineThumbnail(file.mimeType, file.thumbnailStorageKey)
        ? this.createThumbnailAccessUrl(file)
        : null,
      uploaderId: file.uploaderId,
      kind: this.getFileKind(file.mimeType),
    };
  }

  private async getReadableFileOrThrow(groupId: string, fileId: string, userId: string) {
    return this.fileAccess.getReadableFile(groupId, fileId, userId);
  }

  buildDirectUploadStorageKey(groupId: string, originalName: string) {
    const safeName = originalName
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-');
    return `${groupId}/${Date.now()}-${randomUUID()}-${safeName || 'upload.bin'}`;
  }

  private buildStorageKey(groupId: string, originalName: string) {
    return this.buildDirectUploadStorageKey(groupId, originalName);
  }

  private buildThumbnailStorageKey(originalStorageKey: string): string {
    const idx = originalStorageKey.indexOf('/');
    const groupId = originalStorageKey.slice(0, idx);
    const objectKey = originalStorageKey.slice(idx + 1);
    return `${groupId}/thumb/${objectKey}.jpg`;
  }

  normalizeDirectUploadOriginalName(originalName: string) {
    const trimmed = originalName.trim();
    if (!trimmed) {
      return 'upload.bin';
    }

    const decoded = Buffer.from(trimmed, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) {
      return trimmed;
    }

    const originalHasCjk = /[\u3400-\u9fff]/u.test(trimmed);
    const decodedHasCjk = /[\u3400-\u9fff]/u.test(decoded);
    const originalLooksMojibake = /[ÃÅÆÇÐÑØÞà-ÿ]/.test(trimmed);

    if (!originalHasCjk && (decodedHasCjk || originalLooksMojibake)) {
      return decoded;
    }

    return trimmed;
  }

  private normalizeOriginalName(originalName: string) {
    return this.normalizeDirectUploadOriginalName(originalName);
  }

  private getFileKind(mimeType: string) {
    return mimeType.startsWith('image/') ? 'image' : 'file';
  }

  private assertFileTypeMatchesContent(file: Express.Multer.File): void {
    const buffer = file.buffer;
    const claimedMime = file.mimetype || '';

    const actualMime = this.detectMimeFromMagicBytes(buffer);

    if (!actualMime) return;

    if (claimedMime === actualMime) return;
    if (claimedMime.startsWith('image/') && actualMime.startsWith('image/')) return;

    const dangerousPairs = [
      { claimed: 'image/', actual: 'text/html' },
      { claimed: 'image/', actual: 'text/javascript' },
      { claimed: 'image/', actual: 'application/javascript' },
    ];

    for (const pair of dangerousPairs) {
      if (claimedMime.startsWith(pair.claimed) && actualMime === pair.actual) {
        this.logger.warn(
          'file_type_mismatch_rejected',
          JSON.stringify({
            claimed: claimedMime,
            detected: actualMime,
            originalName: file.originalname,
          }),
        );
        throw new BadRequestException('文件内容与类型不匹配，请检查文件。');
      }
    }
  }

  private detectMimeFromMagicBytes(buffer: Buffer): string | null {
    if (buffer.length < 4) return null;

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47)
      return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38)
      return 'image/gif';
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46)
      return 'image/webp';
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)
      return 'application/pdf';
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
      return 'application/zip';

    const head = buffer.slice(0, 256).toString('utf8').toLowerCase();
    if (head.includes('<!doctype html') || head.includes('<html')) return 'text/html';
    if (head.includes('<script') || head.includes('function(') || head.includes('var '))
      return 'text/javascript';

    return null;
  }

  async uploadBufferToS3(storageKey: string, buffer: Buffer, mimeType: string): Promise<void> {
    return this.objectStorage.put(storageKey, buffer, mimeType);
  }

  async copyS3Object(sourceKey: string, destinationKey: string): Promise<void> {
    return this.objectStorage.copy(sourceKey, destinationKey);
  }

  async deleteS3Object(storageKey: string): Promise<boolean> {
    return this.objectStorage.delete(storageKey);
  }

  async getStreamFromS3(storageKey: string, range?: string) {
    return this.objectStorage.get(storageKey, { range });
  }

  async hasS3Object(storageKey: string): Promise<boolean> {
    return this.objectStorage.exists(storageKey);
  }

  async createPresignedViewUrl(
    storageKey: string,
    mimeType: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    return this.objectStorage.createViewUrl(storageKey, mimeType, expiresInSeconds);
  }

  async createPresignedDownloadUrl(
    storageKey: string,
    mimeType: string,
    originalName: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    return this.objectStorage.createDownloadUrl(
      storageKey,
      mimeType,
      originalName,
      expiresInSeconds,
    );
  }

  async assertObjectSize(storageKey: string, expectedSize: number): Promise<void> {
    return this.objectStorage.assertSize(storageKey, expectedSize);
  }

  async initiateMultipartUpload(
    storageKey: string,
    mimeType: string,
  ): Promise<{ uploadId: string }> {
    return this.objectStorage.initiateMultipart(storageKey, mimeType);
  }

  async uploadMultipartPart(
    storageKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<CompletedMultipartPart> {
    return this.objectStorage.uploadPart(storageKey, uploadId, partNumber, body);
  }

  async completeMultipartUpload(
    storageKey: string,
    uploadId: string,
    parts: CompletedMultipartPart[],
  ): Promise<void> {
    return this.objectStorage.completeMultipart(storageKey, uploadId, parts);
  }

  async abortMultipartUpload(storageKey: string, uploadId: string): Promise<void> {
    return this.objectStorage.abortMultipart(storageKey, uploadId);
  }

  async listMultipartParts(
    storageKey: string,
    uploadId: string,
  ): Promise<Array<{ PartNumber: number; ETag: string; Size: number }>> {
    return this.objectStorage.listParts(storageKey, uploadId);
  }
}
