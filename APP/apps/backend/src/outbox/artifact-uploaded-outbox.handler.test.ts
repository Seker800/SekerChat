import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutboxEventStatus, type OutboxEvent } from '@prisma/client';
import { ArtifactUploadedOutboxHandler } from './artifact-uploaded-outbox.handler';

test('artifact outbox handler passes the event id as the system-message idempotency key', async () => {
  const systemMessageCalls: unknown[][] = [];
  const realtimeCalls: string[] = [];
  const handler = new ArtifactUploadedOutboxHandler(
    {
      user: { findUnique: async () => ({ displayName: 'User 1' }) },
    } as never,
    {
      createSystemMessage: async (...args: unknown[]) => {
        systemMessageCalls.push(args);
      },
    } as never,
    {
      publishGroupUpdated: async (groupId: string) => {
        realtimeCalls.push(groupId);
      },
    } as never,
  );
  const now = new Date();
  const event: OutboxEvent = {
    id: 'event-1',
    eventType: 'artifact.uploaded.v1',
    aggregateType: 'GroupArtifact',
    aggregateId: 'group-1',
    payload: { groupId: 'group-1', actorUserId: 'user-1', originalName: 'report.md' },
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

  assert.deepEqual(systemMessageCalls, [
    ['group-1', 'user-1', 'User 1 上传了产出「report.md」', 'event-1'],
  ]);
  assert.deepEqual(realtimeCalls, ['group-1']);
});
