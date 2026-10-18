import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  MessageDeliveryIntents,
  MessageDeliveryIntent,
} from '../../messages/message-delivery-intents';
import { FilesService } from '../../files/files.service';
import { QqBridgeAccessService, hashBridgeSecret } from './qq-bridge-access.service';
import { FinishDeliveryDto } from './qq-bridge.dto';

@Injectable()
export class QqBridgeDeliveryService implements OnModuleInit, OnModuleDestroy {
  private unregister?: () => void;
  constructor(
    private readonly prisma: PrismaService,
    private readonly intents: MessageDeliveryIntents,
    private readonly access: QqBridgeAccessService,
    private readonly files: FilesService,
  ) {}

  onModuleInit() {
    this.unregister = this.intents.register((tx, message, action) =>
      this.enqueue(tx, message, action),
    );
  }
  onModuleDestroy() {
    this.unregister?.();
  }

  private async enqueue(
    tx: Prisma.TransactionClient,
    message: MessageDeliveryIntent,
    action: 'send' | 'edit' | 'revoke',
  ) {
    if (message.externalAuthor || message.type === 'SYSTEM') return;
    const author = await tx.user.findUnique({
      where: { id: message.senderId },
      select: { isBot: true },
    });
    if (!author || author.isBot) return;
    const binding = await tx.qqBridgeBinding.findFirst({
      where: { groupId: message.groupId, archivedAt: null },
      include: { connector: true },
    });
    if (
      !binding?.enabled ||
      !binding.bidirectional ||
      !binding.connector.enabled ||
      binding.connector.revokedAt
    )
      return;
    try {
      await this.access.activeBinding(tx, binding.connectorId, binding.id, binding.revision);
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof ConflictException) return;
      throw error;
    }
    if (action === 'edit') {
      await tx.qqBridgeDelivery.updateMany({
        where: {
          bindingId: binding.id,
          messageId: message.id,
          action: 'send',
          status: { in: ['sent', 'started', 'uncertain'] },
        },
        data: { errorCode: 'edited-after-dispatch' },
      });
      return;
    }
    if (action === 'revoke') {
      await tx.qqBridgeDelivery.updateMany({
        where: {
          bindingId: binding.id,
          messageId: message.id,
          action: 'send',
          status: { in: ['pending', 'claimed'] },
        },
        data: { status: 'cancelled' },
      });
      const sent = await tx.qqBridgeDelivery.findFirst({
        where: { bindingId: binding.id, messageId: message.id, action: 'send', status: 'sent' },
      });
      if (!sent) return;
    }
    await tx.qqBridgeDelivery.createMany({
      data: [{ bindingId: binding.id, revision: binding.revision, messageId: message.id, action }],
      skipDuplicates: true,
    });
  }

  async claim(connectorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QqBridgeConnector" WHERE id = ${connectorId} FOR UPDATE`;
      const connector = await tx.qqBridgeConnector.findUniqueOrThrow({
        where: { id: connectorId },
      });
      if (!connector.enabled || connector.revokedAt) return null;
      const bindings = await tx.qqBridgeBinding.findMany({
        where: { connectorId, enabled: true, bidirectional: true, archivedAt: null },
      });
      for (const binding of bindings) {
        await tx.qqBridgeDelivery.updateMany({
          where: { bindingId: binding.id, status: 'started', leaseUntil: { lt: new Date() } },
          data: { status: 'uncertain', errorCode: 'result-unknown' },
        });
        await tx.qqBridgeDelivery.updateMany({
          where: { bindingId: binding.id, status: 'claimed', leaseUntil: { lt: new Date() } },
          data: { status: 'pending', leaseHash: null, leaseUntil: null },
        });
        if (
          await tx.qqBridgeDelivery.count({
            where: { bindingId: binding.id, status: { in: ['started', 'claimed', 'uncertain'] } },
          })
        )
          continue;
        const task = await tx.qqBridgeDelivery.findFirst({
          where: { bindingId: binding.id, revision: binding.revision, status: 'pending' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (!task) continue;
        await this.access.activeBinding(tx, connectorId, binding.id, binding.revision);
        const lease = randomBytes(32).toString('hex');
        await tx.qqBridgeDelivery.update({
          where: { id: task.id },
          data: {
            status: 'claimed',
            leaseHash: hashBridgeSecret(lease),
            leaseUntil: new Date(Date.now() + 60000),
          },
        });
        return { id: task.id, bindingId: task.bindingId, revision: task.revision, lease };
      }
      return null;
    });
  }

  private async leased(
    tx: Prisma.TransactionClient,
    connectorId: string,
    id: string,
    lease: string,
  ) {
    const task = await tx.qqBridgeDelivery.findUnique({
      where: { id },
      include: { binding: true },
    });
    if (
      !task ||
      task.binding.connectorId !== connectorId ||
      task.leaseHash !== hashBridgeSecret(lease)
    )
      throw new ConflictException('投递租约无效。');
    return task;
  }

  async start(connectorId: string, id: string, lease: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QqBridgeConnector" WHERE id = ${connectorId} FOR UPDATE`;
      const task = await this.leased(tx, connectorId, id, lease);
      if (task.status !== 'claimed' || !task.leaseUntil || task.leaseUntil.getTime() <= Date.now())
        throw new ConflictException('投递租约已过期。');
      const binding = await this.access.activeBinding(
        tx,
        connectorId,
        task.bindingId,
        task.revision,
      );
      const message = await tx.message.findUnique({
        where: { id: task.messageId },
        include: { sender: true },
      });
      if (!message || (task.action === 'send' && message.revokedAt)) {
        await tx.qqBridgeDelivery.update({ where: { id }, data: { status: 'cancelled' } });
        return null;
      }
      const prior = await tx.qqBridgeDelivery.findFirst({
        where: {
          bindingId: task.bindingId,
          messageId: task.messageId,
          action: 'send',
          status: 'sent',
        },
      });
      const quote = message.replyToMessageId
        ? await tx.qqBridgeDelivery.findFirst({
            where: {
              bindingId: task.bindingId,
              messageId: message.replyToMessageId,
              action: 'send',
              status: 'sent',
            },
          })
        : null;
      const sourceQuote = message.replyToMessageId
        ? await tx.qqBridgeSource.findFirst({
            where: { bindingId: task.bindingId, messageIds: { has: message.replyToMessageId } },
          })
        : null;
      await tx.qqBridgeDelivery.update({
        where: { id },
        data: { status: 'started', leaseUntil: new Date(Date.now() + 60000) },
      });
      return {
        id,
        action: task.action,
        accountId: binding.accountId,
        qqGroupId: binding.qqGroupId,
        externalId: prior?.externalId ?? null,
        replyToId: quote?.externalId ?? sourceQuote?.externalId ?? null,
        text: `${message.sender.displayName || 'Chat 群友'}：${message.text ?? (message.type === 'FILE' ? '〔文件暂不支持同步〕' : '')}`,
        hasImage: message.type === 'IMAGE' && !!message.attachmentFileId,
      };
    });
  }

  async finish(connectorId: string, id: string, dto: FinishDeliveryDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QqBridgeConnector" WHERE id = ${connectorId} FOR UPDATE`;
      const task = await this.leased(tx, connectorId, id, dto.lease);
      if (
        task.status === 'sent' &&
        dto.status === 'sent' &&
        task.externalId === (dto.messageId ?? task.externalId)
      )
        return { ok: true };
      if (!['started', 'uncertain'].includes(task.status))
        throw new ConflictException('投递状态不允许确认。');
      if (dto.status === 'sent' && task.action === 'send' && !dto.messageId)
        throw new BadRequestException('缺少 QQ 消息标识。');
      await tx.qqBridgeDelivery.update({
        where: { id },
        data: {
          status: dto.status,
          externalId: dto.messageId,
          errorCode:
            dto.status === 'sent'
              ? null
              : dto.status === 'uncertain'
                ? 'result-unknown'
                : 'qq-rejected',
          leaseUntil: null,
        },
      });
      return { ok: true };
    });
  }

  async image(connectorId: string, id: string, lease: string) {
    const task = await this.leased(this.prisma, connectorId, id, lease);
    await this.prisma.$transaction((tx) =>
      this.access.activeBinding(tx, connectorId, task.bindingId, task.revision),
    );
    if (!['claimed', 'started'].includes(task.status)) throw new ConflictException('投递不可用。');
    const message = await this.prisma.message.findUnique({
      where: { id: task.messageId },
      include: { attachmentFile: true },
    });
    if (
      !message?.attachmentFile ||
      message.groupId !== task.binding.groupId ||
      message.type !== 'IMAGE' ||
      message.revokedAt
    )
      throw new BadRequestException('图片不可用。');
    return this.files.getStreamFromS3(message.attachmentFile.storageKey);
  }

  async resolve(
    actor: { role: string; sub: string },
    id: string,
    result: 'sent' | 'cancelled',
    externalId?: string,
  ) {
    await this.access.assertAdmin(actor);
    const task = await this.prisma.qqBridgeDelivery.findUniqueOrThrow({
      where: { id },
      include: { binding: true },
    });
    await this.access.assertGroupManager(actor, task.binding.groupId);
    if (!['uncertain', 'failed'].includes(task.status))
      throw new BadRequestException('只有待确认或失败任务可人工处理。');
    if (result === 'sent' && !externalId)
      throw new BadRequestException('请先核对 QQ 并填写消息标识。');
    const updated = await this.prisma.qqBridgeDelivery.updateMany({
      where: { id, status: { in: ['uncertain', 'failed'] } },
      data: { status: result, externalId, errorCode: null },
    });
    if (!updated.count) throw new ConflictException('任务状态已变化，请刷新后重新核对。');
    return { ok: true };
  }
}
