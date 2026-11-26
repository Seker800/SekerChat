import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MAX_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT } from '@sekerchat/shared';
import { MessageType, Prisma } from '@prisma/client';
import { BotAccessService } from '../common/bot-access.service';
import { FilesService } from '../files/files.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../system-config/permission.service';
import { MessageRealtimePublisher } from '../realtime/message-realtime-publisher.service';
import { RealtimePullResponse } from '../realtime/realtime.types';
import { CreateMessageDto, CreateMessageType } from './dto/create-message.dto';
import { assertReadableGroupMembership } from '../groups/group-access';
import { MessageApplicationService } from './message-application.service';
import { MessageGroup } from './message-group.type';
import { MessageReadReceiptService } from './message-read-receipt.service';
import { MessageSerializerService } from './message-serializer.service';
import { SystemMessageService } from './system-message.service';
import { MessageDeliveryIntents } from './message-delivery-intents';
import { OUTBOX_EVENT_TYPES } from '../outbox/outbox.types';
import { OutboxWakeupService } from '../outbox/outbox-wakeup.service';
import {
  messageSelect,
  type MessageReceiptMember,
  type SerializedMessage,
} from './message-record.types';

const MESSAGE_TEXT_MAX_LENGTH = 10_000;
const DEFAULT_PULL_LIMIT = 100;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly filesService: FilesService,
    private readonly realtimePublisher: MessageRealtimePublisher,
    private readonly applicationService: MessageApplicationService,
    private readonly systemMessageService: SystemMessageService,
    private readonly readReceiptService: MessageReadReceiptService,
    private readonly serializerService: MessageSerializerService,
    private readonly botAccessService: BotAccessService,
    private readonly outboxWakeupService: OutboxWakeupService,
    private readonly deliveryIntents: MessageDeliveryIntents,
    private readonly permissionService: PermissionService,
  ) {}

  private async ensureBotAccessAllowed(botUserId: string, actorUserId: string): Promise<void> {
    await this.botAccessService.ensureBotAccessAllowed(botUserId, actorUserId);
  }
  async listMessages(
    userId: string,
    groupId: string,
    options?: {
      cursor?: string;
      limit?: number;
    },
    role?: string,
  ) {
    await this.getReadableGroupOrThrow(groupId, userId, role);

    const limit = this.normalizePullLimit(options?.limit ?? 50);
    const cursor = options?.cursor?.trim() ? this.parseCursor(options.cursor) : undefined;
    // Older pages can never contain the viewer's latest message, so the receipt
    // probe only belongs on the newest page.
    const isNewestPage = cursor === undefined;
    const [messagesDesc, latestOwnMessage] = await Promise.all([
      this.prismaService.message.findMany({
        where: {
          groupId,
          ...(cursor === undefined ? {} : { eventSequence: { lt: cursor } }),
        },
        orderBy: { eventSequence: 'desc' },
        take: limit + 1,
        select: messageSelect,
      }),
      isNewestPage
        ? this.prismaService.message.findFirst({
            where: {
              groupId,
              senderId: userId,
              type: { not: MessageType.SYSTEM },
            },
            orderBy: { eventSequence: 'desc' },
            select: { eventSequence: true },
          })
        : Promise.resolve(null),
    ]);
    const hasMore = messagesDesc.length > limit;
    const page = hasMore ? messagesDesc.slice(0, limit) : messagesDesc;
    const messages = [...page].reverse();
    const latestOwnSequence = latestOwnMessage?.eventSequence ?? null;
    const needsReceipt = messages.some(
      (message) =>
        message.senderId === userId &&
        message.type !== MessageType.SYSTEM &&
        message.eventSequence === latestOwnSequence,
    );
    // Receipts are only rendered for the viewer's own latest message. Other senders'
    // receipt payloads were never displayed by the client, but forced every page to
    // load all group members and aggregate the whole group history.
    const receiptMembers = needsReceipt
      ? await this.readReceiptService.listMessageReceiptMembers(groupId)
      : [];

    return {
      groupId,
      nextCursor: hasMore ? (messages[0]?.eventSequence.toString() ?? null) : null,
      items: await Promise.all(
        messages.map((message) =>
          this.serializerService.serializeMessage(
            message,
            receiptMembers,
            needsReceipt &&
              message.senderId === userId &&
              message.eventSequence === latestOwnSequence,
          ),
        ),
      ),
    };
  }

  async getMessageActivity(userId: string, groupId: string, role?: string) {
    await this.getReadableGroupOrThrow(groupId, userId, role);

    const rows = await this.prismaService.$queryRaw<Array<{ date: string; count: number }>>(
      Prisma.sql`
        SELECT
          to_char(
            (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Shanghai')::date,
            'YYYY-MM-DD'
          ) AS date,
          COUNT(*)::int AS count
        FROM "Message"
        WHERE "groupId" = ${groupId}
          AND "revokedAt" IS NULL
          AND "type"::text <> 'SYSTEM'
        GROUP BY 1
        ORDER BY 1 ASC
      `,
    );

    return {
      days: rows.map((row) => ({
        date: row.date,
        count: Number(row.count),
      })),
    };
  }

  async createMessage(userId: string, groupId: string, dto: CreateMessageDto) {
    const group = await this.getWritableGroupOrThrow(groupId, userId);

    await this.botAccessService.ensureTextMessageAccessAllowed({
      group,
      actorUserId: userId,
      text: dto.type === CreateMessageType.TEXT ? dto.text : undefined,
    });

    await this.validatePayload(userId, groupId, dto);
    const mentionedUserIds =
      dto.type === CreateMessageType.TEXT && dto.text
        ? this.collectMentionedUserIds(dto.text, group.members)
        : [];

    let message: SerializedMessage;
    let idempotencyHit = false;
    try {
      message = await this.prismaService.$transaction(async (transaction) => {
        const createdMessage = await transaction.message.create({
          data: {
            groupId: group.id,
            senderId: userId,
            clientMessageId: dto.clientMessageId ?? null,
            type: this.toPrismaMessageType(dto.type),
            text: dto.type === CreateMessageType.TEXT ? dto.text!.trim() : null,
            attachmentFileId:
              dto.type === CreateMessageType.IMAGE || dto.type === CreateMessageType.FILE
                ? dto.attachment!.fileId.trim()
                : null,
            mentionedUserIds,
            replyToMessageId: dto.replyToMessageId?.trim() || null,
          },
          select: messageSelect,
        });

        if (createdMessage.attachmentFileId) {
          await transaction.fileObject.update({
            where: { id: createdMessage.attachmentFileId },
            data: {
              attachedAt: createdMessage.createdAt,
            },
          });
        }

        await transaction.group.update({
          where: { id: group.id },
          data: { updatedAt: createdMessage.createdAt },
        });
        await transaction.groupMember.updateMany({
          where: { groupId: group.id, userId },
          data: { lastReadEventSequence: createdMessage.eventSequence },
        });
        await transaction.outboxEvent.create({
          data: {
            eventType: OUTBOX_EVENT_TYPES.userMessageCreated,
            aggregateType: 'Message',
            aggregateId: createdMessage.id,
            payload: { messageId: createdMessage.id },
          },
        });

        await this.deliveryIntents.enqueue(transaction, createdMessage, 'send');
        return createdMessage;
      });
    } catch (error) {
      if (!dto.clientMessageId || !this.isClientMessageIdConflict(error)) {
        throw error;
      }

      const existingMessage = await this.prismaService.message.findUnique({
        where: {
          senderId_clientMessageId: {
            senderId: userId,
            clientMessageId: dto.clientMessageId,
          },
        },
        select: messageSelect,
      });
      if (!existingMessage) {
        throw error;
      }
      if (existingMessage.groupId !== group.id) {
        throw new ConflictException('clientMessageId is already used in another group.');
      }
      message = existingMessage;
      idempotencyHit = true;
    }

    this.outboxWakeupService.notify();

    const serializedMessage = await this.applicationService.serializeUserMessage(message);

    this.logger.log(
      'message_created',
      JSON.stringify({
        userId,
        groupId: group.id,
        messageId: message.id,
        type: serializedMessage.type,
        eventId: message.eventSequence.toString(),
        mentionCount: mentionedUserIds.length,
        hasReply: Boolean(serializedMessage.replyTo),
        idempotencyHit,
      }),
    );

    return serializedMessage;
  }

  private isClientMessageIdConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
      return false;
    }
    const target = error.meta?.target;
    return Array.isArray(target)
      ? target.includes('senderId') && target.includes('clientMessageId')
      : String(target).includes('senderId_clientMessageId');
  }

  async createSystemMessage(groupId: string, actorUserId: string, text: string) {
    return this.systemMessageService.createSystemMessage(groupId, actorUserId, text);
  }

  async editMessage(userId: string, groupId: string, messageId: string, text: string) {
    const group = await this.getWritableGroupOrThrow(groupId, userId);

    const message = await this.prismaService.message.findFirst({
      where: { id: messageId, groupId },
      select: { id: true, senderId: true, type: true, revokedAt: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found in this group.');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('Only the sender can edit a message.');
    }

    if (message.revokedAt) {
      throw new BadRequestException('Cannot edit a revoked message.');
    }

    if (message.type !== MessageType.TEXT) {
      throw new BadRequestException('Only text messages can be edited.');
    }

    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new BadRequestException('Edited text must not be empty.');
    }

    if (trimmedText.length > MESSAGE_TEXT_MAX_LENGTH) {
      throw new BadRequestException(
        `Text message exceeds maximum length of ${MESSAGE_TEXT_MAX_LENGTH} characters.`,
      );
    }

    const edit = async (tx: Prisma.TransactionClient) => {
      const updated = await tx.message.update({
        where: { id: messageId },
        data: {
          text: trimmedText,
          mentionedUserIds: this.collectMentionedUserIds(trimmedText, group.members),
          editedAt: new Date(),
        },
        select: messageSelect,
      });

      await this.deliveryIntents.enqueue(tx, updated, 'edit');
      return updated;
    };
    const updated = await this.prismaService.$transaction(edit);
    // The edit broadcast only needs the message body; the client keeps its receipt.
    const serialized = await this.serializeMessageForGroup(updated, [], false);
    await this.realtimePublisher.publishUpdated(groupId, messageId, serialized);

    this.logger.log('message_edited', JSON.stringify({ userId, groupId, messageId }));

    return serialized;
  }

  async revokeMessage(userId: string, groupId: string, messageId: string) {
    await this.getWritableGroupOrThrow(groupId, userId);

    const message = await this.prismaService.message.findFirst({
      where: { id: messageId, groupId },
      select: { id: true, senderId: true, revokedAt: true },
    });

    if (!message) {
      throw new NotFoundException('Message not found in this group.');
    }

    if (message.senderId !== userId) {
      const membership = await this.prismaService.groupMember.findFirst({
        where: { groupId, userId },
        select: { role: true },
      });
      if (!membership || membership.role !== 'ADMIN') {
        throw new ForbiddenException('Only the sender or a group admin can revoke a message.');
      }
    }

    if (message.revokedAt) {
      throw new BadRequestException('Message is already revoked.');
    }

    const revoke = async (tx: Prisma.TransactionClient) => {
      const revoked = await tx.message.update({
        where: { id: messageId },
        data: { revokedAt: new Date() },
        select: messageSelect,
      });

      await this.deliveryIntents.enqueue(tx, revoked, 'revoke');
      return revoked;
    };
    const revoked = await this.prismaService.$transaction(revoke);
    const serialized = await this.serializeMessageForGroup(revoked, [], false);
    await this.realtimePublisher.publishUpdated(groupId, messageId, serialized);

    this.logger.log('message_revoked', JSON.stringify({ userId, groupId, messageId }));

    return serialized;
  }

  async listReminderEvents(
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
    },
  ): Promise<
    RealtimePullResponse<Awaited<ReturnType<MessagesService['serializeMessageForGroup']>>>
  > {
    const cursor = this.parseCursor(options.cursor);
    const limit = this.normalizePullLimit(options.limit);

    const messages = await this.prismaService.message.findMany({
      where: {
        eventSequence: {
          gt: cursor,
        },
        group: {
          members: {
            some: {
              userId,
            },
          },
        },
      },
      orderBy: {
        eventSequence: 'asc',
      },
      take: limit,
      select: {
        ...messageSelect,
        group: {
          select: {
            members: {
              where: { userId },
              select: { notificationsMuted: true, notificationsMutedThroughEventSequence: true },
            },
          },
        },
      },
    });

    // Advance the cursor through muted messages too, so unmuting never replays consumed alerts.
    const notifyMessages = messages.filter(
      (message) =>
        !message.group.members.some(
          (member) =>
            member.notificationsMuted ||
            message.eventSequence <= member.notificationsMutedThroughEventSequence,
        ),
    );
    return {
      // The reminder client does not render read receipts, so the pull response
      // stays free of per-message recipient lists.
      events: await Promise.all(
        notifyMessages.map((message) =>
          this.serializeRealtimeMessageCreated(message, [], false),
        ),
      ),
      nextCursor: messages.at(-1)?.eventSequence.toString() ?? cursor.toString(),
    };
  }

  private async validatePayload(
    userId: string,
    groupId: string,
    dto: CreateMessageDto,
  ): Promise<void> {
    const trimmedText = dto.text?.trim();
    const attachmentFileId = dto.attachment?.fileId?.trim();
    const replyToMessageId = dto.replyToMessageId?.trim();

    if (replyToMessageId) {
      await this.assertReplyTargetUsable(groupId, replyToMessageId);
    }

    if (dto.type === CreateMessageType.TEXT) {
      if (!trimmedText) {
        throw new BadRequestException('Text message requires non-empty text.');
      }

      if (trimmedText.length > MESSAGE_TEXT_MAX_LENGTH) {
        throw new BadRequestException(
          `Text message exceeds maximum length of ${MESSAGE_TEXT_MAX_LENGTH} characters.`,
        );
      }

      if (attachmentFileId) {
        throw new BadRequestException('Mixed-content messages are not allowed.');
      }

      return;
    }

    if (trimmedText) {
      throw new BadRequestException('Mixed-content messages are not allowed.');
    }

    if (!attachmentFileId) {
      throw new BadRequestException(`${dto.type} message requires attachment.fileId.`);
    }

    const file = await this.filesService.assertAttachmentUsable(userId, groupId, attachmentFileId);
    const expectedType = dto.type === CreateMessageType.IMAGE ? 'image' : 'file';
    const actualType = file.mimeType.startsWith('image/') ? 'image' : 'file';

    if (expectedType !== actualType) {
      throw new BadRequestException(
        `${dto.type} message requires an uploaded ${expectedType} file reference.`,
      );
    }
  }

  private async getReadableGroupOrThrow(groupId: string, userId: string, role?: string) {
    const effectiveRole =
      role ??
      (
        await this.prismaService.user.findUnique({
          where: { id: userId },
          select: { role: true },
        })
      )?.role;
    const canReadAllNonDmGroups = effectiveRole
      ? await this.permissionService.hasPermission(effectiveRole, 'view_all_groups')
      : false;

    return assertReadableGroupMembership(
      this.prismaService,
      this.logger,
      userId,
      groupId,
      'message_access_denied',
      canReadAllNonDmGroups,
    );
  }

  private async getWritableGroupOrThrow(groupId: string, userId: string) {
    const group = await this.prismaService.group.findFirst({
      where: {
        id: groupId,
        members: {
          some: {
            userId,
          },
        },
      },
      select: {
        id: true,
        archivedAt: true,
        isDM: true,
        members: {
          select: {
            userId: true,
            user: {
              select: {
                email: true,
                displayName: true,
                role: true,
                isBot: true,
              },
            },
          },
        },
      },
    });

    if (!group) {
      this.logger.warn(
        'message_write_denied',
        JSON.stringify({
          userId,
          groupId,
          reason: 'not_member',
        }),
      );
      throw new ForbiddenException('Group access denied.');
    }

    if (group.archivedAt) {
      this.logger.warn(
        'message_write_denied',
        JSON.stringify({
          userId,
          groupId,
          reason: 'archived_group',
        }),
      );
      throw new BadRequestException('Archived group is read-only.');
    }

    return group;
  }

  private toPrismaMessageType(type: CreateMessageType): MessageType {
    switch (type) {
      case CreateMessageType.TEXT:
        return MessageType.TEXT;
      case CreateMessageType.IMAGE:
        return MessageType.IMAGE;
      case CreateMessageType.FILE:
        return MessageType.FILE;
      default:
        throw new NotFoundException('Unsupported message type.');
    }
  }

  async serializeMessageForGroup(
    message: SerializedMessage,
    preFetchedReceiptMembers?: MessageReceiptMember[],
    isLastFromSender = true,
  ) {
    const receiptMembers =
      preFetchedReceiptMembers ??
      (isLastFromSender
        ? await this.readReceiptService.listMessageReceiptMembers(message.groupId)
        : []);
    return this.serializerService.serializeMessage(message, receiptMembers, isLastFromSender);
  }

  private async serializeRealtimeMessageCreated(
    message: SerializedMessage,
    preFetchedReceiptMembers?: MessageReceiptMember[],
    isLastFromSender = true,
  ) {
    return {
      eventId: message.eventSequence.toString(),
      eventVersion: 1 as const,
      type: 'message.created.v1' as const,
      groupId: message.groupId,
      occurredAt: message.createdAt.toISOString(),
      payload: await this.serializeMessageForGroup(
        message,
        preFetchedReceiptMembers,
        isLastFromSender,
      ),
    };
  }

  private parseCursor(cursor: string | undefined): bigint {
    if (!cursor?.trim()) {
      return 0n;
    }

    try {
      const parsed = BigInt(cursor.trim());
      if (parsed < 0n) {
        throw new BadRequestException('Cursor must be a non-negative integer.');
      }

      return parsed;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('Cursor must be a non-negative integer.');
    }
  }

  private normalizePullLimit(limit: number | undefined): number {
    if (limit === undefined) {
      return DEFAULT_PULL_LIMIT;
    }

    if (!Number.isFinite(limit)) {
      throw new BadRequestException('Limit must be a finite number.');
    }

    return Math.max(1, Math.min(MAX_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT, Math.trunc(limit)));
  }

  private async assertReplyTargetUsable(groupId: string, replyToMessageId: string): Promise<void> {
    const replyTarget = await this.prismaService.message.findFirst({
      where: {
        id: replyToMessageId,
        groupId,
      },
      select: {
        id: true,
      },
    });

    if (!replyTarget) {
      throw new BadRequestException('Reply target does not belong to this group.');
    }
  }

  private collectMentionedUserIds(
    text: string,
    members: Array<{
      userId: string;
      user: {
        email: string;
        displayName: string | null;
      };
    }>,
  ): string[] {
    const tokens = new Set<string>();
    const matcher = /(^|[^@\w])@([^\s@]{1,100}(?:@[^\s@]{1,255})?)/g;
    const normalizedText = text.trim();

    for (const match of normalizedText.matchAll(matcher)) {
      const token = match[2]?.trim().toLowerCase();
      if (token) {
        tokens.add(token);
      }
    }

    const mentionedUserIds = new Set<string>();

    for (const member of members) {
      const localPart = member.user.email.split('@')[0]?.toLowerCase() ?? '';
      const displayName = member.user.displayName?.trim().toLowerCase() ?? '';
      const candidates = [member.user.email.toLowerCase(), localPart, displayName].filter(Boolean);

      if (
        candidates.some(
          (candidate) =>
            tokens.has(candidate) &&
            (!candidate.includes('@') || candidate === member.user.email.toLowerCase()),
        )
      ) {
        mentionedUserIds.add(member.userId);
      }
    }

    return [...mentionedUserIds];
  }
}
