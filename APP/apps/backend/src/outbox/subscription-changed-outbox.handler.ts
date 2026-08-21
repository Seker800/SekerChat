import { Injectable } from '@nestjs/common';
import type { OutboxEvent, Prisma } from '@prisma/client';
import { SubscriptionRealtimePublisher } from '../subscriptions/subscription-realtime-publisher.service';
import { OUTBOX_EVENT_TYPES } from './outbox.types';

type SubscriptionChangedPayload = {
  postId: string;
  reason: 'published' | 'confirmed';
};

@Injectable()
export class SubscriptionChangedOutboxHandler {
  readonly eventType = OUTBOX_EVENT_TYPES.subscriptionChanged;

  constructor(private readonly realtimePublisher: SubscriptionRealtimePublisher) {}

  handle(event: OutboxEvent): Promise<void> {
    const payload = this.parsePayload(event.payload);
    return this.realtimePublisher.publishSubscriptionChanged(payload, event.id);
  }

  private parsePayload(payload: Prisma.JsonValue): SubscriptionChangedPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof payload.postId !== 'string' ||
      (payload.reason !== 'published' && payload.reason !== 'confirmed')
    ) {
      throw new Error('Invalid subscription.changed.v1 outbox payload.');
    }
    return { postId: payload.postId, reason: payload.reason };
  }
}
