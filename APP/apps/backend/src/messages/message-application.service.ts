import { Injectable } from '@nestjs/common';
import { MessageRealtimePublisher } from '../realtime/message-realtime-publisher.service';
import { MessageEventsService } from './message-events.service';
import { MessageReadReceiptService } from './message-read-receipt.service';
import { MessageSerializerService } from './message-serializer.service';
import type { SerializedMessage } from './message-record.types';
import { MessageGroup } from './message-group.type';

@Injectable()
export class MessageApplicationService {
  constructor(
    private readonly readReceiptService: MessageReadReceiptService,
    private readonly serializerService: MessageSerializerService,
    private readonly realtimePublisher: MessageRealtimePublisher,
    private readonly messageEventsService: MessageEventsService,
  ) {}

  async serializeUserMessage(message: SerializedMessage) {
    const receiptMembers = await this.readReceiptService.listMessageReceiptMembers(message.groupId);
    return this.serializerService.serializeMessage(message, receiptMembers);
  }

  async deliverUserMessageCreated(input: {
    eventId: string;
    group: MessageGroup;
    message: SerializedMessage;
  }): Promise<void> {
    const receiptMembers = await this.readReceiptService.listMessageReceiptMembers(input.group.id);
    const serializedMessage = await this.serializerService.serializeMessage(
      input.message,
      receiptMembers,
    );
    await this.realtimePublisher.publishCreated(
      input.group.id,
      input.message.eventSequence,
      serializedMessage,
    );

    await this.messageEventsService.publishUserMessageCreated({
      eventId: input.eventId,
      group: input.group,
      actorUserId: input.message.senderId,
      message: input.message,
      text: input.message.text ?? undefined,
      mentionedUserIds: input.message.mentionedUserIds,
    });
  }
}
