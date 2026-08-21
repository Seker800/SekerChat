import { Injectable } from '@nestjs/common';
import type { SerializedMessage } from './message-record.types';
import { MessageGroup } from './message-group.type';

export type UserMessageCreatedEvent = {
  eventId: string;
  group: MessageGroup;
  actorUserId: string;
  message: SerializedMessage;
  text?: string;
  mentionedUserIds: string[];
};

type UserMessageCreatedHandler = (event: UserMessageCreatedEvent) => void | Promise<void>;

@Injectable()
export class MessageEventsService {
  private readonly handlers = new Set<UserMessageCreatedHandler>();

  registerUserMessageCreatedHandler(handler: UserMessageCreatedHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async publishUserMessageCreated(event: UserMessageCreatedEvent): Promise<void> {
    for (const handler of this.handlers) {
      await handler(event);
    }
  }
}
