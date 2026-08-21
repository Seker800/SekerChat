import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ArchiveGroupApplicationService } from './archive-group-application.service';

test('archive command atomically changes state, revokes shares, and enqueues one event', async () => {
  const calls: string[] = [];
  const transaction = {
    group: {
      updateMany: async () => {
        calls.push('group:archived');
        return { count: 1 };
      },
    },
    fileShare: {
      updateMany: async () => {
        calls.push('shares:revoked');
        return { count: 2 };
      },
    },
    groupWorkState: { deleteMany: async () => ({ count: 0 }) },
  };
  const service = new ArchiveGroupApplicationService(
    {
      $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    } as never,
    {
      enqueue: async () => {
        calls.push('outbox:enqueued');
      },
    } as never,
  );

  const result = await service.execute({
    groupId: 'group-1',
    archive: true,
    reason: 'manual',
  });

  assert.equal(result.changed, true);
  assert.deepEqual(calls, ['group:archived', 'shares:revoked', 'outbox:enqueued']);
});

test('repeating an archive command is a no-op without duplicate side effects', async () => {
  let sideEffectCount = 0;
  const transaction = {
    group: { updateMany: async () => ({ count: 0 }) },
    fileShare: { updateMany: async () => ({ count: 0 }) },
    groupWorkState: { deleteMany: async () => ({ count: 0 }) },
  };
  const service = new ArchiveGroupApplicationService(
    {
      $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    } as never,
    {
      enqueue: async () => {
        sideEffectCount += 1;
      },
    } as never,
  );

  const result = await service.execute({
    groupId: 'group-1',
    archive: true,
    reason: 'manual',
  });

  assert.equal(result.changed, false);
  assert.equal(sideEffectCount, 0);
});

test('manual unarchive clears stale work status but never restores revoked shares', async () => {
  const calls: string[] = [];
  const transaction = {
    group: { updateMany: async () => ({ count: 1 }) },
    fileShare: {
      updateMany: async () => {
        calls.push('shares:changed');
        return { count: 0 };
      },
    },
    groupWorkState: {
      deleteMany: async () => {
        calls.push('work-state:cleared');
        return { count: 1 };
      },
    },
  };
  const service = new ArchiveGroupApplicationService(
    {
      $transaction: async (operation: (tx: typeof transaction) => Promise<unknown>) =>
        operation(transaction),
    } as never,
    { enqueue: async () => calls.push('outbox:enqueued') } as never,
  );

  await service.execute({ groupId: 'group-1', archive: false, reason: 'manual' });

  assert.deepEqual(calls, ['work-state:cleared', 'outbox:enqueued']);
});
