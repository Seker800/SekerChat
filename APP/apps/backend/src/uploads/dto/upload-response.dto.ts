export class UploadSessionResponseDto {
  id!: string;
  kind!: 'CHAT_ATTACHMENT' | 'ARTIFACT' | 'SUBSCRIPTION_ATTACHMENT' | 'ALBUM_PHOTO';
  status!: 'INITIATED' | 'ASSEMBLED' | 'FINALIZING' | 'FAILED' | 'COMPLETED' | 'ABORTED';
  groupId!: string | null;
  subscriptionAttachmentId?: string | null;
  albumPhotoId?: string | null;
  originalName!: string;
  mimeType!: string;
  size!: number;
  multipartUploadId!: string;
  partSizeBytes!: number;
  createdAt!: string;
}

export class UploadedPartResponseDto {
  partNumber!: number;
  etag!: string;
  size!: number;
}

export class UploadedPartsResponseDto {
  uploadSessionId!: string;
  partSizeBytes!: number;
  parts!: UploadedPartResponseDto[];
}

export class UploadPartResponseDto {
  uploadSessionId!: string;
  partNumber!: number;
  etag!: string;
}

export class FinalizedChatFileResponseDto {
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
  kindLabel!: 'image' | 'file';
}

export class FinalizedArtifactValueResponseDto {
  id!: string;
  groupId!: string;
  uploaderId!: string;
  originalName!: string;
  storedName!: string;
  relativePath!: string;
  mimeType!: string;
  size!: number;
  sourceFileId!: string | null;
  createdAt!: string;
  contentUrl!: string;
  metadataUrl!: string;
}

export class FinalizedSubscriptionAttachmentValueResponseDto {
  id!: string;
  postId!: string;
  uploaderId!: string;
  originalName!: string;
  mimeType!: string;
  size!: number;
  sha256!: string;
  downloadCount!: number;
  usage!: 'INLINE_IMAGE' | 'DOWNLOADABLE_FILE';
  createdAt!: string;
}

export class FinalizedChatAttachmentResponseDto {
  kind!: 'CHAT_ATTACHMENT';
  file!: FinalizedChatFileResponseDto;
}

export class FinalizedArtifactResponseDto {
  kind!: 'ARTIFACT';
  artifact!: FinalizedArtifactValueResponseDto;
}

export class FinalizedSubscriptionAttachmentResponseDto {
  kind!: 'SUBSCRIPTION_ATTACHMENT';
  attachment!: FinalizedSubscriptionAttachmentValueResponseDto;
}

export class FinalizedAlbumPhotoValueResponseDto {
  id!: string;
  width!: number;
  height!: number;
  createdAt!: string;
  contentUrl!: string;
  thumbnailUrl!: string | null;
  duplicate!: boolean;
}

export class FinalizedAlbumPhotoResponseDto {
  kind!: 'ALBUM_PHOTO';
  photo!: FinalizedAlbumPhotoValueResponseDto;
}

export class AbortUploadResponseDto {
  uploadSessionId!: string;
  aborted!: boolean;
}
