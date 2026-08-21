export class FileMetadataResponseDto {
  id!: string;
  groupId!: string;
  originalName!: string;
  mimeType!: string;
  size!: number;
  width?: number | null;
  height?: number | null;
  createdAt!: string;
  contentUrl!: string;
  metadataUrl!: string;
  thumbnailUrl!: string | null;
  uploaderId!: string;
  kind!: 'image' | 'file';
}

export class FileDownloadUrlResponseDto {
  url!: string;
  originalName!: string;
  mimeType!: string;
  size!: number;
}

export class FileViewUrlResponseDto {
  url!: string;
  mimeType!: string;
  size!: number;
  expiresAt!: string;
}
