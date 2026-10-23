import { Prisma } from '@prisma/client';
import { filePreviewJobSelect } from '../files/file-preview-state';
import { fileObjectSelect } from '../files/file-record.types';

export const messageSelect = {
  id: true,
  groupId: true,
  senderId: true,
  externalAuthor: true,
  externalAvatarFile: { select: fileObjectSelect },
  eventSequence: true,
  type: true,
  text: true,
  attachmentFileId: true,
  mentionedUserIds: true,
  replyToMessageId: true,
  revokedAt: true,
  editedAt: true,
  createdAt: true,
  sender: {
    select: {
      id: true,
      email: true,
      displayName: true,
      avatarStorageKey: true,
    },
  },
  attachmentFile: {
    select: {
      id: true,
      groupId: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      uploaderId: true,
      storageKey: true,
      previewJob: { select: filePreviewJobSelect },
      thumbnailStorageKey: true,
      thumbnailSize: true,
      imageWidth: true,
      imageHeight: true,
      attachedAt: true,
      share: {
        select: {
          expiresAt: true,
          revokedAt: true,
          revokedReason: true,
        },
      },
      group: {
        select: { archivedAt: true },
      },
    },
  },
  replyToMessage: {
    select: {
      id: true,
      externalAuthor: true,
      externalAvatarFile: { select: fileObjectSelect },
      senderId: true,
      type: true,
      text: true,
      attachmentFileId: true,
      attachmentFile: {
        select: {
          id: true,
          groupId: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
          uploaderId: true,
          storageKey: true,
          previewJob: { select: filePreviewJobSelect },
          thumbnailStorageKey: true,
          thumbnailSize: true,
          imageWidth: true,
          imageHeight: true,
          share: {
            select: {
              expiresAt: true,
              revokedAt: true,
              revokedReason: true,
            },
          },
          group: {
            select: { archivedAt: true },
          },
        },
      },
      sender: {
        select: {
          id: true,
          email: true,
          displayName: true,
          avatarStorageKey: true,
        },
      },
    },
  },
} satisfies Prisma.MessageSelect;

type MessageRecord = Prisma.MessageGetPayload<{ select: typeof messageSelect }>;
type ExternalFields = 'externalAuthor' | 'externalAvatarFile';
export type SerializedMessage = Omit<MessageRecord, ExternalFields | 'replyToMessage'> &
  Partial<Pick<MessageRecord, ExternalFields>> & {
    replyToMessage:
      | (Omit<NonNullable<MessageRecord['replyToMessage']>, ExternalFields> &
          Partial<Pick<NonNullable<MessageRecord['replyToMessage']>, ExternalFields>>)
      | null;
  };

export type MessageReceiptMember = {
  userId: string;
  email: string;
  displayName: string | null;
  avatarStorageKey: string | null;
  lastReadEventSequence: bigint | null;
  isBot: boolean;
};

export type SerializedReadReceiptMember = {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export const READ_RECEIPT_WINDOW_MS = 48 * 60 * 60 * 1000;
