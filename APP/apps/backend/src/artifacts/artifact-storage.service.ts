import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { FilesService } from '../files/files.service';
import { extractArtifactStorageKey, serializeArtifactStorageKey } from './artifact-storage-key';

@Injectable()
export class ArtifactStorageService {
  private readonly apiBaseUrl: string;

  constructor(
    private readonly filesService: FilesService,
    configService: ConfigService,
  ) {
    this.apiBaseUrl = configService.get<string>('API_BASE_URL')?.trim() || 'http://localhost:3100';
  }

  buildStorageKey(groupId: string, storedName: string) {
    return `artifacts/${groupId}/${randomUUID()}/${storedName}`;
  }

  buildStorageKeyForSourceFile(groupId: string, sourceFileId: string, storedName: string) {
    return `artifacts/${groupId}/from-files/${sourceFileId}/${storedName}`;
  }

  serializeStorageKey(storageKey: string) {
    return serializeArtifactStorageKey(storageKey);
  }

  extractStorageKey(relativePath: string) {
    return extractArtifactStorageKey(relativePath);
  }

  uploadBuffer(storageKey: string, buffer: Buffer, mimeType: string) {
    return this.filesService.uploadBufferToS3(storageKey, buffer, mimeType);
  }

  copyFile(sourceStorageKey: string, destinationStorageKey: string) {
    return this.filesService.copyS3Object(sourceStorageKey, destinationStorageKey);
  }

  deleteObject(relativePath: string) {
    return this.filesService.deleteS3Object(this.extractStorageKey(relativePath));
  }

  async exists(relativePath: string) {
    return this.filesService.hasS3Object(this.extractStorageKey(relativePath));
  }

  getStream(relativePath: string, range?: string) {
    return this.filesService.getStreamFromS3(this.extractStorageKey(relativePath), range);
  }

  createArtifactContentUrl(artifact: { id: string; groupId: string }) {
    return new URL(
      `/api/groups/${artifact.groupId}/artifacts/${artifact.id}/content`,
      this.apiBaseUrl,
    ).toString();
  }

  createArtifactMetadataUrl(artifact: { id: string; groupId: string }) {
    return new URL(
      `/api/groups/${artifact.groupId}/artifacts/${artifact.id}`,
      this.apiBaseUrl,
    ).toString();
  }

  async createArtifactDownloadUrl(
    storageKey: string,
    mimeType: string,
    originalName: string,
  ): Promise<string> {
    return this.filesService.createPresignedDownloadUrl(storageKey, mimeType, originalName);
  }
}
