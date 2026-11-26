import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutboxEventStatus, type OutboxEvent } from '@prisma/client';
import { ServerVisibilityOutboxHandler } from './server-visibility-outbox.handler';

function buildEvent(payload: unknown): OutboxEvent {
  return {
    id: 'event-1',
    eventType: 'server.visibility.changed.v1',
    aggregateType: 'Server',
    aggregateId: 'server-1',
    payload,
    status: OutboxEventStatus.PROCESSING,
    attempts: 1,
    availableAt: new Date(),
    lockedAt: new Date(),
    processedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as OutboxEvent;
}

test('server visibility outbox handler publishes the visibility transition', async () => {
  const published: Array<[string, boolean]> = [];
  const handler = new ServerVisibilityOutboxHandler({
    publishServerVisibilityChanged: async (serverId: string, hidden: boolean) => {
      published.push([serverId, hidden]);
    },
  } as never);

  await handler.handle(buildEvent({ serverId: 'server-1', hidden: true }));

  assert.deepEqual(published, [['server-1', true]]);
});

test('server visibility outbox handler rejects malformed payloads', async () => {
  const handler = new ServerVisibilityOutboxHandler({
    publishServerVisibilityChanged: async () => undefined,
  } as never);

  await assert.rejects(
    () => handler.handle(buildEvent({ serverId: '', hidden: 'yes' })),
    /Invalid server.visibility.changed.v1 outbox payload/,
  );
});
