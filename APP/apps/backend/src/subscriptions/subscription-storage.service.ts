import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { FilesService } from '../files/files.service';

@Injectable()
export class SubscriptionStorageService {
  constructor(private readonly filesService: FilesService) {}

  buildStorageKey(postId: string, originalName: string): string {
    return `subscriptions/${postId}/${randomUUID()}/${originalName}`;
  }

  getStream(storageKey: string, range?: string) {
    return this.filesService.getStreamFromS3(storageKey, range);
  }

  deleteObject(storageKey: string) {
    return this.filesService.deleteS3Object(storageKey);
  }

  hasObject(storageKey: string) {
    return this.filesService.hasS3Object(storageKey);
  }

  createDownloadUrl(storageKey: string, mimeType: string, originalName: string) {
    return this.filesService.createPresignedDownloadUrl(storageKey, mimeType, originalName);
  }

  createViewUrl(storageKey: string, mimeType: string) {
    return this.filesService.createPresignedViewUrl(storageKey, mimeType);
  }

  async computeSha256(storageKey: string): Promise<string> {
    const { stream } = await this.filesService.getStreamFromS3(storageKey);
    const hash = createHash('sha256');
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    return hash.digest('hex');
  }
}
