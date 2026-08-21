import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { BotReplyDeliveryStatus } from '@prisma/client';
import { BotReplyDeliveryRepository } from './bot-reply-delivery.repository';

test('delivery claim persists a generated reply for retry without reacquiring external work', async () => {
  let record:
    | { status: BotReplyDeliveryStatus; responseText: string | null; lastError: string | null }
    | undefined;
  const repository = new BotReplyDeliveryRepository({
    botReplyDelivery: {
      createMany: async ({ data }: any) => {
        if (record) return { count: 0 };
        record = { status: data.status, responseText: null, lastError: null };
        return { count: 1 };
      },
      findUniqueOrThrow: async () => record,
      updateMany: async ({ where, data }: any) => {
        const allowedStatuses = Array.isArray(where.status?.in)
          ? where.status.in
          : where.status
            ? [where.status]
            : [];
        if (!record || (allowedStatuses.length > 0 && !allowedStatuses.includes(record.status))) {
          return { count: 0 };
        }
        record = { ...record, ...data };
        return { count: 1 };
      },
    },
  } as never);

  assert.deepEqual(await repository.claim('bot-1', 'group-1', 'event-1'), {
    state: 'ACQUIRED',
  });
  await repository.storeGenerated('bot-1', 'event-1', 'durable reply');
  assert.deepEqual(await repository.claim('bot-1', 'group-1', 'event-1'), {
    state: 'GENERATED',
    responseText: 'durable reply',
  });
  await repository.markCompleted('bot-1', 'event-1');
  assert.equal(record?.status, BotReplyDeliveryStatus.COMPLETED);
});

test('an ambiguous external call is terminal so automatic retries cannot duplicate it', async () => {
  let status = BotReplyDeliveryStatus.CLAIMED;
  const repository = new BotReplyDeliveryRepository({
    botReplyDelivery: {
      createMany: async () => ({ count: 0 }),
      findUniqueOrThrow: async () => ({ status, responseText: null }),
      updateMany: async ({ data }: any) => {
        status = data.status;
        return { count: 1 };
      },
    },
  } as never);

  await repository.markAmbiguous('bot-1', 'event-1', new Error('connection reset'));

  assert.equal(status, BotReplyDeliveryStatus.AMBIGUOUS);
  assert.deepEqual(await repository.claim('bot-1', 'group-1', 'event-1'), {
    state: 'TERMINAL',
  });
});

test('bot reply delivery migration enforces one durable claim per bot and source event', () => {
  const migration = readFileSync(
    join(process.cwd(), 'prisma/migrations/20260811190000_add_bot_reply_deliveries/migration.sql'),
    'utf8',
  );

  assert.match(migration, /CREATE TABLE "BotReplyDelivery"/);
  assert.match(migration, /UNIQUE INDEX[\s\S]*\("botUserId", "sourceEventId"\)/);
  assert.match(migration, /'AMBIGUOUS'/);
  assert.doesNotMatch(migration, /DROP (TABLE|COLUMN)/);
});
