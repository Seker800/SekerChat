import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthReadinessService } from './health-readiness.service';

const requiredConfig = new Map([
  ['DATABASE_URL', 'postgresql://local'],
  ['JWT_ACCESS_SECRET', 'secret'],
  ['S3_ENDPOINT', 'http://minio:9000'],
  ['S3_BUCKET', 'sekerchat'],
]);

test('readiness succeeds only after database and object storage checks pass', async () => {
  const calls: string[] = [];
  const service = new HealthReadinessService(
    { $queryRaw: async () => calls.push('database') } as never,
    { get: (key: string) => requiredConfig.get(key) } as never,
    { checkReady: async () => calls.push('storage') } as never,
  );

  assert.deepEqual(await service.check(), { status: 'ready' });
  assert.deepEqual(calls.sort(), ['database', 'storage']);
});

test('readiness fails closed when a dependency is unavailable', async () => {
  const service = new HealthReadinessService(
    { $queryRaw: async () => Promise.reject(new Error('database unavailable')) } as never,
    { get: (key: string) => requiredConfig.get(key) } as never,
    { checkReady: async () => undefined } as never,
  );

  await assert.rejects(() => service.check(), ServiceUnavailableException);
});

test('readiness reports missing production configuration without touching dependencies', async () => {
  let dependencyCalls = 0;
  const service = new HealthReadinessService(
    { $queryRaw: async () => (dependencyCalls += 1) } as never,
    { get: () => undefined } as never,
    { checkReady: async () => (dependencyCalls += 1) } as never,
  );

  await assert.rejects(() => service.check(), ServiceUnavailableException);
  assert.equal(dependencyCalls, 0);
});
