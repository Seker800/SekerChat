import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { OutboxEventStatus, type OutboxEvent } from '@prisma/client';
import { OutboxWorkerService } from './outbox-worker.service';
import { OutboxWakeupService } from './outbox-wakeup.service';

function event(id: string): OutboxEvent {
  const now = new Date();
  return {
    id,
    eventType: 'artifact.uploaded.v1',
    aggregateType: 'GroupArtifact',
    aggregateId: 'group-1',
    payload: {},
    status: OutboxEventStatus.PROCESSING,
    attempts: 1,
    availableAt: now,
    lockedAt: now,
    processedAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

test('outbox worker acknowledges success and reschedules failures without stopping the batch', async () => {
  const pending = [event('event-1'), event('event-2')];
  const processed: string[] = [];
  const failed: string[] = [];
  const wakeupService = new OutboxWakeupService();
  const worker = new OutboxWorkerService(
    {
      claimNext: async () => pending.shift() ?? null,
      markProcessed: async (eventId: string) => {
        processed.push(eventId);
      },
      markFailed: async (outboxEvent: OutboxEvent) => {
        failed.push(outboxEvent.id);
      },
    } as never,
    {
      dispatch: async (outboxEvent: OutboxEvent) => {
        if (outboxEvent.id === 'event-1') throw new Error('temporary failure');
      },
    } as never,
    wakeupService,
  );

  await worker.processPendingEvents();

  assert.deepEqual(failed, ['event-1']);
  assert.deepEqual(processed, ['event-2']);
});

test('outbox worker drains immediately after a wakeup and keeps concurrent wakeups serialized', async () => {
  const wakeupService = new OutboxWakeupService();
  let releaseFirstClaim: (() => void) | undefined;
  let activeClaims = 0;
  let maxActiveClaims = 0;
  let claimCalls = 0;
  const worker = new OutboxWorkerService(
    {
      claimNext: async () => {
        claimCalls += 1;
        activeClaims += 1;
        maxActiveClaims = Math.max(maxActiveClaims, activeClaims);
        if (claimCalls === 1) {
          await new Promise<void>((resolve) => {
            releaseFirstClaim = resolve;
          });
        }
        activeClaims -= 1;
        return null;
      },
    } as never,
    { dispatch: async () => undefined } as never,
    wakeupService,
  );

  worker.onModuleInit();
  wakeupService.notify();
  wakeupService.notify();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(claimCalls, 1);

  releaseFirstClaim?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(maxActiveClaims, 1);
  assert.equal(claimCalls, 2);
  worker.onModuleDestroy();
});

test('one wakeup drains more than one batch without waiting for the cron fallback', async () => {
  const wakeupService = new OutboxWakeupService();
  const pending = Array.from({ length: 30 }, (_, index) => event(`event-${index + 1}`));
  const processed: string[] = [];
  const worker = new OutboxWorkerService(
    {
      claimNext: async () => pending.shift() ?? null,
      markProcessed: async (eventId: string) => {
        processed.push(eventId);
      },
      markFailed: async () => undefined,
    } as never,
    { dispatch: async () => undefined } as never,
    wakeupService,
  );

  worker.onModuleInit();
  wakeupService.notify();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(processed.length, 30);
  assert.equal(pending.length, 0);
  worker.onModuleDestroy();
});

test('a wakeup arriving while the current drain settles starts another immediate drain', async () => {
  const wakeupService = new OutboxWakeupService();
  let claimCalls = 0;
  const worker = new OutboxWorkerService(
    {
      claimNext: async () => {
        claimCalls += 1;
        if (claimCalls === 1) queueMicrotask(() => wakeupService.notify());
        return null;
      },
    } as never,
    { dispatch: async () => undefined } as never,
    wakeupService,
  );

  worker.onModuleInit();
  wakeupService.notify();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(claimCalls, 2);
  worker.onModuleDestroy();
});

test('an immediate wakeup failure is contained so the cron fallback can retry later', async () => {
  const wakeupService = new OutboxWakeupService();
  let claimCalls = 0;
  const worker = new OutboxWorkerService(
    {
      claimNext: async () => {
        claimCalls += 1;
        throw new Error('database temporarily unavailable');
      },
    } as never,
    { dispatch: async () => undefined } as never,
    wakeupService,
  );

  worker.onModuleInit();
  wakeupService.notify();
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(claimCalls, 1);
  worker.onModuleDestroy();
});
