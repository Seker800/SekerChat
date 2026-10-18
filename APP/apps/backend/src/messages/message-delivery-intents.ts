import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type MessageDeliveryIntent = {
  id: string;
  groupId: string;
  senderId: string;
  type: string;
  externalAuthor?: Prisma.JsonValue | null;
};
export type MessageDeliverySink = (
  transaction: Prisma.TransactionClient,
  message: MessageDeliveryIntent,
  action: 'send' | 'edit' | 'revoke',
) => Promise<void>;

/** Registrations are process configuration; every delivery intent is persisted in the caller's transaction. */
@Injectable()
export class MessageDeliveryIntents {
  private readonly sinks = new Set<MessageDeliverySink>();

  register(sink: MessageDeliverySink): () => void {
    this.sinks.add(sink);
    return () => {
      this.sinks.delete(sink);
    };
  }

  async enqueue(
    tx: Prisma.TransactionClient,
    message: MessageDeliveryIntent,
    action: 'send' | 'edit' | 'revoke',
  ) {
    for (const sink of this.sinks) await sink(tx, message, action);
  }
}
