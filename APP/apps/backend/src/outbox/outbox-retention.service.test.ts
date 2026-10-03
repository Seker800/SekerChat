import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutboxEventStatus } from '@prisma/client';
import { OutboxRetentionService } from './outbox-retention.service';

test('outbox retention archives failed events transactionally before deleting them', async () => {
  const failed = {
    id: 'failed-1', eventType: 'example', aggregateType: 'file', aggregateId: 'file-1',
    payload: { key: 'value' }, attempts: 10, lastError: 'delivery failed',
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };
  const calls: string[] = [];
  let present = true;
  const prisma = {
    outboxEvent: {
      count: async () => 1,
      findMany: async ({ where }: any) => where.status === OutboxEventStatus.FAILED && present ? [failed] : [],
      deleteMany: async ({ where }: any) => {
        assert.equal(where.status, OutboxEventStatus.FAILED);
        calls.push('delete');
        present = false;
        return { count: 1 };
      },
    },
    outboxDeadLetter: {
      createMany: async ({ data }: any) => {
        assert.equal(data[0].sourceEventId, failed.id);
        assert.deepEqual(data[0].payload, failed.payload);
        assert.equal(data[0].lastError, failed.lastError);
        calls.push('archive');
      },
      findMany: async () => [],
    },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma),
  };
  await new OutboxRetentionService(prisma as never).cleanup();
  assert.deepEqual(calls, ['archive', 'delete']);
});

test('outbox retention keeps failed events when archival fails', async () => {
  let deleted = false;
  const prisma = {
    outboxEvent: {
      count: async () => 1,
      findMany: async ({ where }: any) => where.status === OutboxEventStatus.FAILED ? [{
        id: 'failed-1', eventType: 'example', aggregateType: 'file', aggregateId: 'file-1',
        payload: {}, attempts: 10, lastError: 'failed', updatedAt: new Date('2025-01-01T00:00:00Z'),
      }] : [],
      deleteMany: async () => { deleted = true; return { count: 1 }; },
    },
    outboxDeadLetter: { createMany: async () => { throw new Error('archive unavailable'); }, findMany: async () => [] },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma),
  };
  await assert.rejects(new OutboxRetentionService(prisma as never).cleanup(), /archive unavailable/);
  assert.equal(deleted, false);
});

test('outbox retention removes archived dead letters after their retention window', async () => {
  const deleted: string[] = [];
  let present = true;
  const prisma = {
    outboxEvent: {
      count: async () => 0,
      findMany: async () => [],
    },
    outboxDeadLetter: {
      findMany: async ({ where }: any) => {
        assert.ok(where.archivedAt.lt instanceof Date);
        return present ? [{ id: 'archive-1' }] : [];
      },
      deleteMany: async ({ where }: any) => {
        deleted.push(...where.id.in);
        present = false;
        return { count: 1 };
      },
    },
    $transaction: async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma),
  };
  await new OutboxRetentionService(prisma as never).cleanup();
  assert.deepEqual(deleted, ['archive-1']);
});
