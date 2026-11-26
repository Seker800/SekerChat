import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageReadReceiptService } from './message-read-receipt.service';

test('a replayed system message cannot move the cursor or channel timestamp backwards', async () => {
  const writes: Array<{ table: string; args: any }> = [];
  const prisma = {
    $transaction: async (operations: unknown[]) => Promise.all(operations),
    group: {
      updateMany: (args: unknown) => {
        writes.push({ table: 'group', args });
        return Promise.resolve({ count: 1 });
      },
    },
    groupMember: {
      updateMany: (args: unknown) => {
        writes.push({ table: 'groupMember', args });
        return Promise.resolve({ count: 1 });
      },
    },
  };
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const service = new MessageReadReceiptService(prisma as never, {} as never);

  await service.touchGroupAndReadReceipt('group-1', 'user-1', createdAt, 42n);

  const groupWrite = writes.find((write) => write.table === 'group');
  const memberWrite = writes.find((write) => write.table === 'groupMember');
  assert.deepEqual(groupWrite?.args, {
    where: { id: 'group-1', updatedAt: { lt: createdAt } },
    data: { updatedAt: createdAt },
  });
  assert.deepEqual(memberWrite?.args, {
    where: {
      groupId: 'group-1',
      userId: 'user-1',
      OR: [{ lastReadEventSequence: null }, { lastReadEventSequence: { lt: 42n } }],
    },
    data: { lastReadEventSequence: 42n },
  });
});
