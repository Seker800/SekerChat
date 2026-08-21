import { Injectable } from '@nestjs/common';
import { AvatarsService } from '../avatars/avatars.service';
import { FilesService } from '../files/files.service';
import { resolveFileShareStatus } from '../file-shares/file-share-state';
import type { MessageReceiptMember, SerializedMessage } from './message-record.types';
import { MessageReadReceiptService } from './message-read-receipt.service';

@Injectable()
export class MessageSerializerService {
  constructor(
    private readonly filesService: FilesService,
    private readonly avatarsService: AvatarsService,
    private readonly readReceiptService: MessageReadReceiptService,
  ) {}

  async serializeMessage(
    message: SerializedMessage,
    receiptMembers: MessageReceiptMember[],
    isLastFromSender = true,
  ) {
    const [attachment, replyToAttachment] = await Promise.all([
      this.serializeAttachment(message.attachmentFile),
      this.serializeAttachment(message.replyToMessage?.attachmentFile ?? null),
    ]);

    return {
      id: message.id,
      eventSequence: message.eventSequence.toString(),
      groupId: message.groupId,
      senderId: message.senderId,
      type: message.type.toLowerCase(),
      text: message.text,
      revokedAt: message.revokedAt?.toISOString() ?? null,
      editedAt: message.editedAt?.toISOString() ?? null,
      mentionedUserIds: message.mentionedUserIds,
      replyTo: message.replyToMessage
        ? {
            id: message.replyToMessage.id,
            senderId: message.replyToMessage.senderId,
            type: message.replyToMessage.type.toLowerCase(),
            textPreview: message.replyToMessage.text,
            sender: {
              id: message.replyToMessage.sender.id,
              email: message.replyToMessage.sender.email,
              displayName: message.replyToMessage.sender.displayName,
              avatarUrl: this.avatarsService.buildUserAvatarUrl(
                message.replyToMessage.sender.id,
                message.replyToMessage.sender.avatarStorageKey ?? null,
              ),
            },
            attachment: replyToAttachment,
          }
        : null,
      attachment,
      readReceipt: isLastFromSender
        ? this.readReceiptService.buildReadReceipt(message, receiptMembers)
        : null,
      createdAt: message.createdAt,
      sender: {
        id: message.sender.id,
        email: message.sender.email,
        displayName: message.sender.displayName,
        avatarUrl: this.avatarsService.buildUserAvatarUrl(
          message.sender.id,
          message.sender.avatarStorageKey ?? null,
        ),
      },
    };
  }

  private async serializeAttachment(
    attachmentFile:
      | SerializedMessage['attachmentFile']
      | NonNullable<SerializedMessage['replyToMessage']>['attachmentFile']
      | null,
  ) {
    if (!attachmentFile) {
      return null;
    }

    const share = attachmentFile.share;
    const dimensions = await this.filesService.resolveRenderableImageDimensions(attachmentFile);

    return {
      id: attachmentFile.id,
      fileId: attachmentFile.id,
      groupId: attachmentFile.groupId,
      uploaderId: attachmentFile.uploaderId,
      originalName: attachmentFile.originalName,
      mimeType: attachmentFile.mimeType,
      size: Number(attachmentFile.size),
      createdAt: attachmentFile.createdAt,
      width: dimensions.width,
      height: dimensions.height,
      contentUrl: this.filesService.createFileAccessUrl(attachmentFile),
      thumbnailUrl: this.filesService.shouldExposeInlineThumbnail(
        attachmentFile.mimeType,
        attachmentFile.thumbnailStorageKey,
      )
        ? this.filesService.createThumbnailAccessUrl({
            id: attachmentFile.id,
            groupId: attachmentFile.groupId,
          })
        : null,
      isSharing:
        share !== null && share !== undefined
          ? resolveFileShareStatus({
              expiresAt: share.expiresAt,
              revokedAt: share.revokedAt,
              revokedReason: share.revokedReason,
              groupArchivedAt: attachmentFile.group?.archivedAt ?? null,
            }) === 'ACTIVE'
          : false,
      kind: (attachmentFile.mimeType.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
    };
  }
}
