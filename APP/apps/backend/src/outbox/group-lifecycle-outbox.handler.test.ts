import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutboxEventStatus, type OutboxEvent } from '@prisma/client';
import { GroupLifecycleOutboxHandler } from './group-lifecycle-outbox.handler';

test('group lifecycle handler emits its idempotent system message before the group update', async () => {
  const calls: string[] = [];
  const handler = new GroupLifecycleOutboxHandler(
    {
      createSystemMessage: async (
        _groupId: string,
        _actorId: string,
        text: string,
        key: string,
      ) => {
        calls.push(`message:${key}:${text}`);
      },
    } as never,
    {
      invalidateGroupMemberCache: (groupId: string) => {
        calls.push(`cache:${groupId}`);
      },
      publishGroupUpdated: async (groupId: string) => {
        calls.push(`group:${groupId}`);
      },
    } as never,
  );
  const now = new Date();
  const event: OutboxEvent = {
    id: 'event-1',
    eventType: 'group.lifecycle.changed.v1',
    aggregateType: 'Group',
    aggregateId: 'group-1',
    payload: {
      groupId: 'group-1',
      archive: true,
      reason: 'manual',
      notification: { actorUserId: 'user-1', text: '管理员归档了频道' },
    },
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

  assert.deepEqual(calls, ['cache:group-1', 'message:event-1:管理员归档了频道', 'group:group-1']);
});
