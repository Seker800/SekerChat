import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ServersService } from './servers.service';

function buildServer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'server-1',
    name: '研发',
    avatarStorageKey: null,
    archivedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('ensureServerByName resolves a legacy name claim to the original stable Server id', async () => {
  const originalServer = buildServer({ name: '平台' });
  let serverCreateCalls = 0;
  let advisoryLockCalls = 0;
  const transaction = {
    $executeRaw: async () => {
      advisoryLockCalls += 1;
      return 1;
    },
    serverNameClaim: {
      findUnique: async () => ({ server: originalServer }),
      create: async () => undefined,
    },
    server: {
      findUnique: async () => null,
      create: async () => {
        serverCreateCalls += 1;
        return buildServer({ id: 'server-2', name: '研发' });
      },
    },
    category: { upsert: async () => undefined },
  };
  const service = new ServersService(
    {
      $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    } as never,
    {} as never,
    {} as never,
    { getOrThrow: () => 'http://api.example.test' } as never,
  );

  const resolved = await service.ensureServerByName('研发');

  assert.equal(resolved.id, 'server-1');
  assert.equal(resolved.name, '平台');
  assert.equal(serverCreateCalls, 0);
  assert.equal(advisoryLockCalls, 1);
});

test('resolveServer accepts a legacy category when it belongs to the supplied stable id', async () => {
  const server = buildServer({ name: '平台' });
  const service = new ServersService(
    {
      server: { findUnique: async () => server },
      serverNameClaim: {
        findUnique: async () => ({ serverId: 'server-1' }),
      },
      category: { upsert: async () => undefined },
    } as never,
    {} as never,
    {} as never,
    { getOrThrow: () => 'http://api.example.test' } as never,
  );

  const resolved = await service.resolveServer({ serverId: 'server-1', category: '研发' });

  assert.equal(resolved.id, 'server-1');
});

test('rename changes only Server identity data and leaves Group compatibility rows untouched', async () => {
  const serverUpdates: unknown[] = [];
  const nameClaimUpserts: unknown[] = [];
  let groupUpdateCalls = 0;
  let advisoryLockCalls = 0;
  const transaction = {
    $queryRaw: async () => [buildServer()],
    $executeRaw: async () => {
      advisoryLockCalls += 1;
      return 1;
    },
    server: {
      findUnique: async () => buildServer(),
      update: async ({ data }: { data: { name: string } }) => {
        serverUpdates.push(data);
        return buildServer({ name: data.name });
      },
    },
    serverNameClaim: {
      findUnique: async () => null,
      updateMany: async () => ({ count: 1 }),
      upsert: async (input: unknown) => nameClaimUpserts.push(input),
    },
    category: { upsert: async () => undefined },
    group: { updateMany: async () => groupUpdateCalls++ },
  };
  const prisma = {
    server: { findUnique: async () => buildServer() },
    group: { count: async () => 1 },
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
  };
  const service = new ServersService(
    prisma as never,
    { assertPermission: async () => undefined } as never,
    {} as never,
    { getOrThrow: () => 'http://api.example.test' } as never,
  );

  const renamed = await service.rename({ sub: 'admin-1', role: 'ADMIN' }, 'server-1', '平台');

  assert.deepEqual(serverUpdates, [{ name: '平台' }]);
  assert.equal(nameClaimUpserts.length, 2);
  assert.equal(groupUpdateCalls, 0);
  assert.equal(advisoryLockCalls, 1);
  assert.equal(renamed.id, 'server-1');
  assert.equal(renamed.name, '平台');
});

test('archive commits Server state and one durable fan-out request in the same transaction', async () => {
  const enqueued: unknown[] = [];
  const transaction = {
    server: { updateMany: async () => ({ count: 1 }) },
    group: { count: async () => 3 },
  };
  const prisma = {
    server: { findUnique: async () => buildServer() },
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
  };
  const service = new ServersService(
    prisma as never,
    {} as never,
    {
      enqueue: async (_tx: unknown, event: unknown) => {
        enqueued.push(event);
      },
    } as never,
    { getOrThrow: () => 'http://api.example.test' } as never,
  );

  const result = await service.archive({ sub: 'super-1', role: 'SUPER_ADMIN' }, 'server-1', true);

  assert.equal(result.groupCount, 3);
  assert.equal(enqueued.length, 1);
  assert.deepEqual((enqueued[0] as { payload: unknown }).payload, {
    serverId: 'server-1',
    archive: true,
  });
});

test('archive is idempotent and returns the persisted timestamp without duplicating fan-out', async () => {
  const archivedAt = new Date('2026-08-10T00:00:00.000Z');
  let enqueueCalls = 0;
  const transaction = {
    server: { updateMany: async () => ({ count: 0 }) },
    group: { count: async () => 2 },
  };
  const service = new ServersService(
    {
      server: { findUnique: async () => buildServer({ archivedAt }) },
      $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    } as never,
    {} as never,
    { enqueue: async () => enqueueCalls++ } as never,
    { getOrThrow: () => 'http://api.example.test' } as never,
  );

  const result = await service.archive({ sub: 'super-1', role: 'SUPER_ADMIN' }, 'server-1', true);

  assert.equal(result.archivedAt, archivedAt);
  assert.equal(enqueueCalls, 0);
});

test('renaming to the current name returns the public response shape', async () => {
  const service = new ServersService(
    {
      server: { findUnique: async () => buildServer() },
      group: { count: async () => 1 },
    } as never,
    { assertPermission: async () => undefined } as never,
    {} as never,
    { getOrThrow: () => 'http://api.example.test' } as never,
  );

  const result = await service.rename({ sub: 'admin-1', role: 'ADMIN' }, 'server-1', '研发');

  assert.equal(result.avatarUrl, null);
  assert.equal('avatarStorageKey' in result, false);
});
