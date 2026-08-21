import { Injectable, Logger } from '@nestjs/common';
import { MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessageRealtimePublisher } from '../realtime/message-realtime-publisher.service';
import { MessageReadReceiptService } from './message-read-receipt.service';
import { MessageSerializerService } from './message-serializer.service';
import { messageSelect } from './message-record.types';

@Injectable()
export class SystemMessageService {
  private readonly logger = new Logger(SystemMessageService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly readReceiptService: MessageReadReceiptService,
    private readonly serializerService: MessageSerializerService,
    private readonly realtimePublisher: MessageRealtimePublisher,
  ) {}

  async createSystemMessage(
    groupId: string,
    actorUserId: string,
    text: string,
    outboxEventId?: string,
  ) {
    const message = await this.prismaService.$transaction(async (transaction) => {
      const data = {
        groupId,
        senderId: actorUserId,
        type: MessageType.SYSTEM,
        text,
        ...(outboxEventId ? { outboxEventId } : {}),
      };
      if (!outboxEventId) {
        return transaction.message.create({ data, select: messageSelect });
      }
      return transaction.message.upsert({
        where: { outboxEventId },
        create: data,
        update: {},
        select: messageSelect,
      });
    });

    await this.readReceiptService.touchGroupAndReadReceipt(
      groupId,
      actorUserId,
      message.createdAt,
      message.eventSequence,
    );

    const receiptMembers = await this.readReceiptService.listMessageReceiptMembers(groupId);
    const serializedMessage = await this.serializerService.serializeMessage(
      message,
      receiptMembers,
    );
    await this.realtimePublisher.publishCreated(groupId, message.eventSequence, serializedMessage);

    this.logger.log(
      'system_message_created',
      JSON.stringify({ actorUserId, groupId, messageId: message.id, text }),
    );

    return serializedMessage;
  }
}
