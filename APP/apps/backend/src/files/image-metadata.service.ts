import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RenderableImageFileRecord } from './file-record.types';
import { createImageProcessor } from './image-processing-policy';
import { ObjectStorageGateway } from './object-storage.gateway';

@Injectable()
export class ImageMetadataService {
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
    const { stream } = await this.objectStorage.get(objectKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stream)
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return this.fromBuffer(Buffer.concat(chunks), mimeType);
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
