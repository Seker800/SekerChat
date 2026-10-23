import { Injectable } from '@nestjs/common';
import type { RenderableImageFileRecord } from './file-record.types';
import { createImageProcessor } from './image-processing-policy';
import { ObjectStorageGateway } from './object-storage.gateway';
import { withStoredImage } from './stored-image-processing';

@Injectable()
export class ImageMetadataService {
  constructor(private readonly objectStorage: ObjectStorageGateway) {}

  async fromBuffer(buffer: Buffer, mimeType: string) {
    if (!this.isTrackable(mimeType) || !buffer.length) return null;
    const metadata = await createImageProcessor(buffer).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  }

  async fromObject(objectKey: string, mimeType: string) {
    if (!this.isTrackable(mimeType)) return null;
    return withStoredImage(this.objectStorage, objectKey, async (filename) => {
      const metadata = await createImageProcessor(filename).metadata();
      return metadata.width && metadata.height
        ? { width: metadata.width, height: metadata.height }
        : null;
    });
  }

  async resolve(file: RenderableImageFileRecord) {
    // Message reads only serialize facts. Legacy metadata is repaired by the
    // durable preview worker, never by downloading originals in a read request.
    return { width: file.imageWidth ?? null, height: file.imageHeight ?? null };
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
