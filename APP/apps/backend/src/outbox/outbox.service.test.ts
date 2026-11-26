import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutboxService } from './outbox.service';

function createPrismaDouble(statements: string[]) {
  return {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        $executeRaw: async (strings: TemplateStringsArray) => {
          statements.push(strings.join(''));
        },
        $queryRaw: async () => [],
        outboxEvent: {
          update: async ({ data }: { data: { status: string } }) => ({ id: 'event-1', ...data }),
        },
      }),
  };
}

test('claim and processed bookkeeping skip the WAL fsync wait', async () => {
  const statements: string[] = [];
  const service = new OutboxService(createPrismaDouble(statements) as never);

  assert.equal(await service.claimNext(), null);
  await service.markProcessed('event-1');

  // Delivery is at-least-once, so losing either mark only causes a redelivery
  // that consumers dedupe; business writes keep the synchronous default.
  assert.deepEqual(statements, [
    'SET LOCAL synchronous_commit = off',
    'SET LOCAL synchronous_commit = off',
  ]);
});
