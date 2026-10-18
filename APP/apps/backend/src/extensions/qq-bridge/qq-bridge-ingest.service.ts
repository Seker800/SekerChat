import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { ExternalMessagesService } from '../../messages/external-messages.service';
import { OutboxWakeupService } from '../../outbox/outbox-wakeup.service';
import { QqBridgeAccessService } from './qq-bridge-access.service';
import { IngestQqMessageDto, MediaUploadDto, RevokeQqMessageDto } from './qq-bridge.dto';
import { AuthenticatedUser } from '../../auth/types/authenticated-user.type';

@Injectable()
export class QqBridgeIngestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: QqBridgeAccessService,
    private readonly messages: ExternalMessagesService,
    private readonly wakeup: OutboxWakeupService,
  ) {}

  async ingest(connectorId: string, dto: IngestQqMessageDto) {
    return this.persist(connectorId, dto, false);
  }

  async importHistory(actor: AuthenticatedUser, bindingId: string, dto: IngestQqMessageDto) {
    await this.access.assertAdmin(actor);
    if (bindingId !== dto.bindingId) throw new BadRequestException('历史消息与目标绑定不一致。');
    const binding = await this.prisma.qqBridgeBinding.findUniqueOrThrow({
      where: { id: bindingId },
    });
    await this.access.assertGroupManager(actor, binding.groupId, true);
    return this.persist(binding.connectorId, dto, true);
  }

  private async persist(connectorId: string, dto: IngestQqMessageDto, importHistory: boolean) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const binding = await this.access.activeBinding(
          tx,
          connectorId,
          dto.bindingId,
          dto.revision,
        );
        const key = { bindingId: binding.id, externalId: dto.messageId };
        const prior = await tx.qqBridgeSource.findUnique({ where: { bindingId_externalId: key } });
        if (prior) return { ids: prior.messageIds, duplicate: true };
        // A sent reply may be observed again as an own-message event. Source IDs, never body text, resolve the echo.
        const echo = await tx.qqBridgeDelivery.findFirst({
          where: { bindingId: binding.id, externalId: dto.messageId, action: 'send' },
        });
        if (echo) return { ids: [echo.messageId], echo: true };
        if (
          !importHistory &&
          binding.enabledAt &&
          new Date(dto.occurredAt).getTime() < binding.enabledAt.getTime() - 2000
        )
          return { ids: [], skipped: 'before-enabled' };
        if (new Date(dto.occurredAt).getTime() > Date.now() + 60_000)
          throw new BadRequestException('消息时间无效。');
        if (!dto.parts.length) throw new BadRequestException('消息不能为空。');
        const actor = await this.messages.getActor(tx);
        const mediaIds = [dto.avatarFileId, ...dto.parts.map((p) => p.fileId)].filter(
          (id): id is string => !!id,
        );
        const media = await tx.fileObject.findMany({
          where: {
            id: { in: mediaIds },
            groupId: binding.groupId,
            uploaderId: actor.id,
            mimeType: { startsWith: 'image/' },
          },
          select: { id: true },
        });
        if (new Set(mediaIds).size !== media.length)
          throw new BadRequestException('图片不属于此绑定。');
        const replySource = dto.replyToId
          ? await tx.qqBridgeSource.findUnique({
              where: { bindingId_externalId: { bindingId: binding.id, externalId: dto.replyToId } },
            })
          : null;
        const replyDelivery = dto.replyToId
          ? await tx.qqBridgeDelivery.findFirst({
              where: { bindingId: binding.id, externalId: dto.replyToId, action: 'send' },
            })
          : null;
        const replyId = replySource?.messageIds[0] ?? replyDelivery?.messageId;
        const reply = replyId
          ? await tx.message.findFirst({
              where: { id: replyId, groupId: binding.groupId },
              select: { id: true },
            })
          : null;
        const source = await tx.qqBridgeSource.create({ data: key });
        const ids: string[] = [];
        for (const [index, part] of dto.parts.entries()) {
          if (part.type === 'text' && !part.text?.trim())
            throw new BadRequestException('文字内容不能为空。');
          if (part.type === 'image' && !part.fileId) throw new BadRequestException('缺少图片。');
          const message = await this.messages.create(tx, {
            groupId: binding.groupId,
            key: `${source.id}:${index}`,
            actorId: actor.id,
            author: {
              id: createHash('sha256').update(`${binding.accountId}:${dto.senderId}`).digest('hex'),
              platform: 'qq',
              displayName: dto.displayName.trim() || 'QQ 群友',
              occurredAt: dto.occurredAt,
            },
            text:
              part.type === 'text'
                ? `${index === 0 && dto.replyToId && !reply ? '〔引用的 QQ 消息未同步〕\n' : ''}${part.text}`
                : undefined,
            fileId: part.type === 'image' ? part.fileId : undefined,
            avatarFileId: dto.avatarFileId,
            replyToMessageId: index === 0 ? reply?.id : undefined,
          });
          ids.push(message.id);
        }
        await tx.qqBridgeSource.update({ where: { id: source.id }, data: { messageIds: ids } });
        return { ids, duplicate: false };
      },
      { timeout: 15000 },
    );
    this.wakeup.notify();
    return result;
  }

  async revoke(connectorId: string, dto: RevokeQqMessageDto) {
    await this.prisma.$transaction(async (tx) => {
      const binding = await this.access.activeBinding(tx, connectorId, dto.bindingId, dto.revision);
      const source = await tx.qqBridgeSource.upsert({
        where: { bindingId_externalId: { bindingId: binding.id, externalId: dto.messageId } },
        create: { bindingId: binding.id, externalId: dto.messageId, revokedAt: new Date() },
        update: { revokedAt: new Date() },
      });
      await this.messages.revoke(tx, binding.groupId, source.messageIds);
    });
    this.wakeup.notify();
    return { ok: true };
  }

  async upload(connectorId: string, dto: MediaUploadDto, buffer?: Buffer) {
    if (!buffer) throw new BadRequestException('请选择图片。');
    const binding = await this.prisma.$transaction((tx) =>
      this.access.activeBinding(tx, connectorId, dto.bindingId, dto.revision),
    );
    const file = await this.messages.stageImage(binding.groupId, buffer);
    await this.prisma.$transaction((tx) =>
      this.access.activeBinding(tx, connectorId, dto.bindingId, dto.revision),
    );
    return { fileId: file.id };
  }
}
