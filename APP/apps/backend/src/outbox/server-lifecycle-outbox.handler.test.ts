import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { OutboxEventStatus, type OutboxEvent } from '@prisma/client';
import { ServerLifecycleOutboxHandler } from './server-lifecycle-outbox.handler';

test('server lifecycle fan-out reuses the idempotent channel archive application service', async () => {
  const commands: unknown[] = [];
  const handler = new ServerLifecycleOutboxHandler(
    {
      group: {
        findMany: async () => [{ id: 'group-1' }, { id: 'group-2' }],
      },
    } as never,
    {
      execute: async (command: unknown) => {
        commands.push(command);
      },
    } as never,
  );
  const now = new Date();
  const event: OutboxEvent = {
    id: 'event-1',
    eventType: 'server.lifecycle.requested.v1',
    aggregateType: 'Server',
    aggregateId: 'server-1',
    payload: { serverId: 'server-1', archive: true },
    status: OutboxEventStatus.PROCESSING,
    attempts: 1,
    availableAt: now,
    lockedAt: now,
    processedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };

  await handler.handle(event);

  assert.deepEqual(commands, [
    { groupId: 'group-1', archive: true, reason: 'server' },
    { groupId: 'group-2', archive: true, reason: 'server' },
  ]);
});
