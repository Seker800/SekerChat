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
    // Read receipts are meaningful to the sender only and already travel with the
    // HTTP response. Broadcast a receipt-free payload instead of shipping an
    // O(members) unread list to every connection for every message.
    const serializedMessage = await this.serializerService.serializeMessage(
      input.message,
      [],
      false,
    );
    if (input.message.externalAuthor && input.message.revokedAt) {
      await this.realtimePublisher.publishUpdated(
        input.group.id,
        input.message.id,
        serializedMessage,
      );
      return;
    }
    await this.realtimePublisher.publishCreated(
      input.group.id,
      input.message.eventSequence,
      serializedMessage,
    );

    if (input.message.externalAuthor) return;

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
