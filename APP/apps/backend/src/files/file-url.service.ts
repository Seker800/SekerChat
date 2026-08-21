import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FileUrlService {
  private readonly apiBaseUrl: string;

  constructor(config: ConfigService) {
    this.apiBaseUrl = config.getOrThrow<string>('API_BASE_URL');
  }

  content(file: { id: string; groupId: string }): string {
    return new URL(
      `/api/groups/${file.groupId}/files/${file.id}/content`,
      this.apiBaseUrl,
    ).toString();
  }

  metadata(file: { id: string; groupId: string }): string {
    return new URL(`/api/groups/${file.groupId}/files/${file.id}`, this.apiBaseUrl).toString();
  }

  thumbnail(file: { id: string; groupId: string }): string {
    return new URL(
      `/api/groups/${file.groupId}/files/${file.id}/thumbnail`,
      this.apiBaseUrl,
    ).toString();
  }
}
