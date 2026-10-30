import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutboxEventStatus, type OutboxEvent } from '@prisma/client';
import { SubscriptionChangedOutboxHandler } from './subscription-changed-outbox.handler';

for (const reason of ['confirmed', 'viewed'])
  test(`subscription outbox handler publishes ${reason} with the durable event id`, async () => {
    const published: Array<Record<string, unknown>> = [];
    const handler = new SubscriptionChangedOutboxHandler({
      publishSubscriptionChanged: async (payload: Record<string, unknown>, eventId: string) => {
        published.push({ payload, eventId });
      },
    } as never);
    const event: OutboxEvent = {
      id: 'event-1',
      eventType: 'subscription.changed.v1',
      aggregateType: 'SubscriptionPost',
      aggregateId: 'post-1',
      payload: { postId: 'post-1', reason, actorUserId: 'reader-1' },
      status: OutboxEventStatus.PROCESSING,
      attempts: 1,
      availableAt: new Date(),
      lockedAt: new Date(),
      processedAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await handler.handle(event);

    assert.deepEqual(published, [
      {
        payload: { postId: 'post-1', reason },
        eventId: 'event-1',
      },
    ]);
  });
