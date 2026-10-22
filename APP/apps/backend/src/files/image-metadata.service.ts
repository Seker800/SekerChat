import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RenderableImageFileRecord } from './file-record.types';
import { createImageProcessor } from './image-processing-policy';
import { ObjectStorageGateway } from './object-storage.gateway';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const MAX_IMAGE_METADATA_BYTES = 50 * 1024 * 1024;
const MAX_CONCURRENT_METADATA_READS = 2;

@Injectable()
export class ImageMetadataService {
  private activeReads = 0;
  private readonly logger = new Logger(ImageMetadataService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly objectStorage: ObjectStorageGateway,
  ) {}

  async fromBuffer(buffer: Buffer, mimeType: string) {
    if (!this.isTrackable(mimeType) || !buffer.length) return null;
    const metadata = await createImageProcessor(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  }

  async fromObject(objectKey: string, mimeType: string) {
    if (!this.isTrackable(mimeType)) return null;
    // Single backend instance: cap concurrent temporary files and native metadata work.
    if (this.activeReads >= MAX_CONCURRENT_METADATA_READS) {
      throw new ServiceUnavailableException('图片元数据处理繁忙，请稍后重试。');
    }
    this.activeReads++;
    let directory: string | undefined;
    let stream: Awaited<ReturnType<ObjectStorageGateway['get']>>['stream'] | undefined;
    try {
      const object = await this.objectStorage.get(objectKey, { range: `bytes=0-${MAX_IMAGE_METADATA_BYTES}` });
      stream = object.stream;
      if (object.contentLength > MAX_IMAGE_METADATA_BYTES) {
        throw new BadRequestException('图片元数据处理上限为 50MB。');
      }
      directory = await mkdtemp(join(tmpdir(), 'sekerchat-image-metadata-'));
      const filename = join(directory, 'input');
      let bytes = 0;
      const limit = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          bytes += chunk.length;
          callback(bytes > MAX_IMAGE_METADATA_BYTES
            ? new BadRequestException('图片元数据处理上限为 50MB。')
            : null, chunk);
        },
      });
      await pipeline(stream, limit, createWriteStream(filename, { flags: 'wx', mode: 0o600 }));
      const metadata = await createImageProcessor(filename).metadata();
      return metadata.width && metadata.height ? { width: metadata.width, height: metadata.height } : null;
    } finally {
      stream?.destroy();
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } finally {
        this.activeReads--;
      }
    }
  }

  async resolve(file: RenderableImageFileRecord) {
    if (!this.isTrackable(file.mimeType) || (file.imageWidth && file.imageHeight)) {
      return { width: file.imageWidth ?? null, height: file.imageHeight ?? null };
    }
    try {
      const dimensions = await this.fromObject(file.storageKey, file.mimeType);
      if (!dimensions) return { width: null, height: null };
      await this.prismaService.fileObject.update({
        where: { id: file.id },
        data: { imageWidth: dimensions.width, imageHeight: dimensions.height },
      });
      return dimensions;
    } catch (error) {
      this.logger.warn(
        'legacy_image_dimensions_backfill_failed',
        JSON.stringify({
          fileId: file.id,
          groupId: file.groupId,
          storageKey: file.storageKey,
          error: error instanceof Error ? error.message : 'Unknown',
        }),
      );
      return { width: file.imageWidth ?? null, height: file.imageHeight ?? null };
    }
  }

  shouldExposeThumbnail(mimeType: string, thumbnailKey?: string | null): boolean {
    return Boolean(thumbnailKey) && !this.prefersAnimatedOriginal(mimeType);
  }

  shouldGenerateThumbnail(mimeType: string): boolean {
    return this.isTrackable(mimeType) && !this.prefersAnimatedOriginal(mimeType);
  }

  private isTrackable(mimeType: string): boolean {
    return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mimeType.toLowerCase());
  }

  private prefersAnimatedOriginal(mimeType: string): boolean {
    return mimeType.toLowerCase() === 'image/gif';
  }
}
