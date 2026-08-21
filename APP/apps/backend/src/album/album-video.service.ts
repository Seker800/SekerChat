import { Injectable } from '@nestjs/common';
import { MediaVideoService } from '../files/media-video.service';
import { AlbumVideoMetadata } from './album-video-policy';

@Injectable()
export class AlbumVideoService {
  constructor(private readonly mediaVideos: MediaVideoService) {}

  inspect(storageKey: string): Promise<AlbumVideoMetadata> {
    return this.mediaVideos.inspect(storageKey);
  }

  inspectAndHash(storageKey: string): Promise<AlbumVideoMetadata & { sha256: string }> {
    return this.mediaVideos.inspectAndHash(storageKey);
  }

  generatePoster(storageKey: string): Promise<Buffer> {
    return this.mediaVideos.generatePoster(storageKey);
  }
}
