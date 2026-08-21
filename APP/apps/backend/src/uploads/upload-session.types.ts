import { Prisma } from '@prisma/client';

export const uploadSessionSelect = {
  id: true,
  kind: true,
  status: true,
  originalName: true,
  mimeType: true,
  size: true,
  objectKey: true,
  multipartUploadId: true,
  completionParts: true,
  uploaderId: true,
  groupId: true,
  subscriptionAttachmentId: true,
  albumPhotoId: true,
  objectCleanupPending: true,
  assembledAt: true,
  finalizationStartedAt: true,
  finalizationAttempts: true,
  lastError: true,
  completedAt: true,
  abortedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UploadSessionSelect;

export type UploadSessionRecord = Prisma.UploadSessionGetPayload<{
  select: typeof uploadSessionSelect;
}>;

export type FinalizedUploadResult =
  | {
      kind: 'CHAT_ATTACHMENT';
      file: {
        id: string;
        groupId: string;
        originalName: string;
        mimeType: string;
        size: number;
        width?: number | null;
        height?: number | null;
        createdAt: Date;
        contentUrl: string;
        metadataUrl: string;
        thumbnailUrl: string | null;
        uploaderId: string;
        kindLabel: 'image' | 'file';
      };
    }
  | {
      kind: 'ARTIFACT';
      artifact: {
        id: string;
        groupId: string;
        uploaderId: string;
        originalName: string;
        storedName: string;
        relativePath: string;
        mimeType: string;
        size: number;
        createdAt: Date;
        contentUrl: string;
        metadataUrl: string;
      };
    }
  | {
      kind: 'SUBSCRIPTION_ATTACHMENT';
      attachment: {
        id: string;
        postId: string;
        uploaderId: string;
        originalName: string;
        mimeType: string;
        size: number;
        sha256: string;
        downloadCount: number;
        usage: 'INLINE_IMAGE' | 'DOWNLOADABLE_FILE';
        createdAt: Date;
      };
    }
  | {
      kind: 'ALBUM_PHOTO';
      photo: {
        id: string;
        width: number;
        height: number;
        createdAt: Date;
        contentUrl: string;
        thumbnailUrl: string | null;
        duplicate: boolean;
      };
    };
