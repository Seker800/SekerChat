import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, MessageType } from '@prisma/client';
import { createHash } from 'node:crypto';
import { OUTBOX_EVENT_TYPES } from '../outbox/outbox.types';
import { type ExternalAuthor } from './external-author';
import { messageSelect } from './message-record.types';
import { FilesService } from '../files/files.service';
import { createImageProcessor } from '../files/image-processing-policy';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExternalMessagesService {
  constructor(
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
  ) {}

  async stageImage(groupId: string, buffer: Buffer) {
    if (!buffer.length || buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException('图片须小于 10 MB。');
    let metadata;
    try {
      metadata = await createImageProcessor(buffer).metadata();
    } catch {
      throw new BadRequestException('图片内容无效。');
    }
    const format = metadata.format;
    if (
      !format ||
      !['png', 'jpeg', 'gif', 'webp'].includes(format) ||
      !metadata.width ||
      !metadata.height
    )
      throw new BadRequestException('仅支持 PNG、JPEG、GIF、WebP 图片。');
    const storageKey = `external-images/${groupId}/${createHash('sha256').update(buffer).digest('hex')}`;
    // Reserve a recoverable reference before touching object storage. Interrupted uploads remain visible to cleanup.
    const file = await this.prisma.$transaction(async (tx) => {
      const actor = await this.getActor(tx);
      return tx.fileObject.upsert({
        where: { storageKey },
        update: { updatedAt: new Date() },
        create: {
          storageKey,
          originalName: `qq-image.${format}`,
          mimeType: `image/${format}`,
          size: buffer.length,
          imageWidth: metadata.width,
          imageHeight: metadata.height,
          uploaderId: actor.id,
          groupId,
        },
      });
    });
    await this.files.uploadBufferToS3(storageKey, buffer, `image/${format}`);
    return file;
  }
  async stageFile(groupId: string, buffer: Buffer, originalName: string) {
    if (!buffer.length || buffer.length > 10 * 1024 * 1024)
      throw new BadRequestException('文件须大于零且小于 10 MB。');
    const name = originalName.split(/[\\/]/).at(-1)?.normalize('NFC').trim() ?? '';
    if (
      !name ||
      name === '.' ||
      name === '..' ||
      name.length > 255 ||
      Array.from(name).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      throw new BadRequestException('文件名无效。');
    // Files remain downloads, never HTML or other active content served inline.
    const mimeType = 'application/octet-stream';
    const digest = createHash('sha256').update(name).update('\0').update(buffer).digest('hex');
    const storageKey = `external-files/${groupId}/${digest}`;
    const file = await this.prisma.$transaction(async (tx) => {
      const actor = await this.getActor(tx);
      return tx.fileObject.upsert({
        where: { storageKey },
        update: { updatedAt: new Date() },
        create: {
          storageKey,
          originalName: name,
          mimeType,
          size: buffer.length,
          uploaderId: actor.id,
          groupId,
        },
      });
    });
    await this.files.uploadBufferToS3(storageKey, buffer, mimeType);
    return file;
  }
  async getActor(tx: Prisma.TransactionClient) {
    const actor = await tx.user.upsert({
      where: { email: 'qq-bridge@integration.invalid' },
      create: {
        email: 'qq-bridge@integration.invalid',
        displayName: 'QQ 群同步',
        isBot: true,
        integrationKind: 'qq-bridge',
        disabledAt: new Date(),
      },
      update: {},
    });
    if (
      !actor.isBot ||
      !actor.disabledAt ||
      actor.passwordHash ||
      actor.role !== 'MEMBER' ||
      (actor.integrationKind && actor.integrationKind !== 'qq-bridge')
    )
      throw new BadRequestException('集成写入身份配置无效。');
    return actor.integrationKind
      ? actor
      : tx.user.update({ where: { id: actor.id }, data: { integrationKind: 'qq-bridge' } });
  }

  async create(
    tx: Prisma.TransactionClient,
    input: {
      groupId: string;
      key: string;
      actorId: string;
      author: ExternalAuthor;
      text?: string;
      fileId?: string;
      attachmentType?: 'image' | 'file';
      avatarFileId?: string;
      replyToMessageId?: string;
    },
  ) {
    const message = await tx.message.create({
      data: {
        groupId: input.groupId,
        senderId: input.actorId,
        externalKey: createHash('sha256').update(input.key).digest('hex'),
        externalAuthor: input.author,
        externalAvatarFileId: input.avatarFileId,
        type: input.fileId
          ? input.attachmentType === 'file'
            ? MessageType.FILE
            : MessageType.IMAGE
          : MessageType.TEXT,
        text: input.text ?? null,
        attachmentFileId: input.fileId,
        replyToMessageId: input.replyToMessageId,
      },
      select: messageSelect,
    });
    const fileIds = [input.fileId, input.avatarFileId].filter((id): id is string => !!id);
    if (fileIds.length)
      await tx.fileObject.updateMany({
        where: { id: { in: fileIds } },
        data: { attachedAt: new Date() },
      });
    await tx.group.update({ where: { id: input.groupId }, data: { updatedAt: message.createdAt } });
    await tx.outboxEvent.create({
      data: {
        eventType: OUTBOX_EVENT_TYPES.userMessageCreated,
        aggregateType: 'Message',
        aggregateId: message.id,
        payload: { messageId: message.id },
      },
    });
    return message;
  }

  async revoke(tx: Prisma.TransactionClient, groupId: string, ids: string[]) {
    await tx.message.updateMany({
      where: { id: { in: ids }, groupId, externalAuthor: { not: Prisma.DbNull } },
      data: { revokedAt: new Date() },
    });
    // Existing outbox publishes the current record; replaying a revoked external record remains idempotent for clients.
    for (const id of ids)
      await tx.outboxEvent.create({
        data: {
          eventType: OUTBOX_EVENT_TYPES.userMessageCreated,
          aggregateType: 'Message',
          aggregateId: id,
          payload: { messageId: id },
        },
      });
  }
}
