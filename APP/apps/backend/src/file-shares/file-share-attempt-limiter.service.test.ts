import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { HttpException, HttpStatus } from '@nestjs/common';
import { FileShareAttemptLimiterService } from './file-share-attempt-limiter.service';

type Row = Record<string, any>;

function createPrismaHarness() {
  const attempts = new Map<string, Row>();
  const clients = new Map<string, Row>();
  const attemptKey = (value: { shareTokenHash: string; clientFingerprint: string }) =>
    `${value.shareTokenHash}:${value.clientFingerprint}`;

  const prisma: any = {
    fileShareUnlockAttempt: {
      findUnique: async ({ where }: any) => attempts.get(attemptKey(where.shareTokenHash_clientFingerprint)) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const key = attemptKey(where.shareTokenHash_clientFingerprint);
        const row = attempts.has(key) ? { ...attempts.get(key), ...update } : { ...create };
        attempts.set(key, row);
        return row;
      },
      deleteMany: async ({ where }: any) => {
        if (where.shareTokenHash && where.clientFingerprint) attempts.delete(attemptKey(where));
        return { count: 1 };
      },
    },
    fileShareClientRisk: {
      findUnique: async ({ where }: any) => clients.get(where.clientFingerprint) ?? null,
      upsert: async ({ where, create, update }: any) => {
        const key = where.clientFingerprint;
        const row = clients.has(key) ? { ...clients.get(key), ...update } : { ...create };
        clients.set(key, row);
        return row;
      },
      deleteMany: async () => ({ count: 0 }),
    },
    $executeRaw: async () => 1,
    $transaction: async (operation: any) =>
      typeof operation === 'function' ? operation(prisma) : Promise.all(operation),
  };

  return { prisma, attempts, clients };
}

const key = { shareTokenHash: 'share-hash', clientFingerprint: 'client-hmac' };

test('failure state survives service restarts and is shared by multiple backend instances', async () => {
  const harness = createPrismaHarness();
  const firstInstance = new FileShareAttemptLimiterService(harness.prisma);
  const secondInstance = new FileShareAttemptLimiterService(harness.prisma);
  const now = new Date('2026-08-10T10:00:00.000Z');

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await firstInstance.recordFailure(key, now);
  }

  await assert.rejects(
    () => secondInstance.assertAllowed(key, now),
    (error: unknown) =>
      error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS,
  );
  await assert.doesNotReject(() => secondInstance.assertAllowed(key, new Date(now.getTime() + 15 * 60_000)));
});

test('ten thousand fake tokens cannot evict a real share lock', async () => {
  const harness = createPrismaHarness();
  const limiter = new FileShareAttemptLimiterService(harness.prisma);
  const now = new Date('2026-08-10T10:00:00.000Z');

  for (let attempt = 0; attempt < 5; attempt += 1) await limiter.recordFailure(key, now);
  for (let index = 0; index < 10_000; index += 1) {
    await limiter.recordFailure({
      shareTokenHash: `fake-${index}`,
      clientFingerprint: `fake-client-${index}`,
    }, now);
  }

  assert.equal(harness.attempts.size, 10_001);
  await assert.rejects(() => limiter.assertAllowed(key, now), HttpException);
});

test('global client risk blocks token spraying and lockouts increase exponentially', async () => {
  const harness = createPrismaHarness();
  const limiter = new FileShareAttemptLimiterService(harness.prisma);
  const now = new Date('2026-08-10T10:00:00.000Z');

  for (let index = 0; index < 30; index += 1) {
    await limiter.recordFailure({
      shareTokenHash: `spray-${index}`,
      clientFingerprint: key.clientFingerprint,
    }, now);
  }
  await assert.rejects(
    () => limiter.assertAllowed({ shareTokenHash: 'new-target', clientFingerprint: key.clientFingerprint }, now),
    HttpException,
  );

  const afterFirstLockout = new Date(now.getTime() + 15 * 60_000);
  for (let attempt = 0; attempt < 5; attempt += 1) await limiter.recordFailure(key, afterFirstLockout);
  const row = harness.attempts.get('share-hash:client-hmac');
  assert.equal(row?.lockoutLevel, 1);
});

test('a successful unlock resets only that share and client pair', async () => {
  const harness = createPrismaHarness();
  const limiter = new FileShareAttemptLimiterService(harness.prisma);
  for (let attempt = 0; attempt < 5; attempt += 1) await limiter.recordFailure(key);

  await limiter.reset(key);
  await assert.doesNotReject(() => limiter.assertAllowed(
    { ...key, clientFingerprint: 'another-client' },
  ));
  assert.equal(harness.attempts.has('share-hash:client-hmac'), false);
});
