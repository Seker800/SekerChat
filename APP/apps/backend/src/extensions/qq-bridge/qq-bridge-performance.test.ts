import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QqBridgeDeliveryService } from './qq-bridge-delivery.service';
import { QqBridgeConnectorController } from './qq-bridge-connector.controller';

function fixture(hasWork = false) {
  let transactions = 0;
  const queries: unknown[] = [];
  const updates: unknown[] = [];
  const tx = {
    $queryRaw: async (...args: unknown[]) => {
      queries.push(args);
      return [];
    },
    $executeRaw: async (...args: unknown[]) => {
      queries.push(args);
      return 0;
    },
    qqBridgeConnector: {
      findUniqueOrThrow: async () => ({ enabled: true }),
      update: async (args: unknown) => {
        updates.push(args);
      },
    },
    qqBridgeBinding: { findMany: async () => [] },
  };
  const prisma = {
    $queryRaw: async () => (hasWork ? [{ id: 'task' }] : []),
    qqBridgeConnector: tx.qqBridgeConnector,
    $transaction: async (run: (value: typeof tx) => unknown) => {
      transactions++;
      return run(tx);
    },
  };
  return { prisma, queries, updates, transactions: () => transactions };
}

test('idle claim does not open a transaction or acquire row locks', async () => {
  const f = fixture();
  const service = new QqBridgeDeliveryService(
    f.prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
  assert.equal(await service.claim('connector'), null);
  assert.equal(f.transactions(), 0);
  assert.equal(f.queries.length, 0);
});

test('potential work is rechecked inside the existing durable transaction', async () => {
  const f = fixture(true);
  const service = new QqBridgeDeliveryService(
    f.prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
  assert.equal(await service.claim('connector'), null);
  assert.equal(f.transactions(), 1);
  assert.match(String(f.queries[0]), /FOR UPDATE/);
  assert.ok(!f.queries.some((q) => String(q).includes('synchronous_commit')));
});

test('unchanged recent heartbeat avoids a write; changed connectivity persists immediately', async () => {
  const f = fixture();
  const controller = new QqBridgeConnectorController(f.prisma as never, {} as never, {} as never);
  const request = {
    connector: { id: 'connector', lastSeenAt: new Date(), connected: true, catalog: [] },
  } as never;
  await controller.heartbeat(request, { connected: true });
  assert.equal(f.updates.length, 0);
  await controller.heartbeat(request, { connected: false });
  assert.equal(f.updates.length, 1);
  assert.match(String(f.queries[0]), /SET LOCAL synchronous_commit/);
});

test('old heartbeat and changed catalog persist with transaction-local async commit', async () => {
  const f = fixture();
  const controller = new QqBridgeConnectorController(f.prisma as never, {} as never, {} as never);
  await controller.heartbeat(
    { connector: { id: 'connector', lastSeenAt: new Date(0), connected: true } } as never,
    { connected: true },
  );
  await controller.heartbeat(
    {
      connector: { id: 'connector', lastSeenAt: new Date(), connected: true, catalog: [] },
    } as never,
    { connected: true, groups: [{ id: '123', name: '群' }] },
  );
  assert.equal(f.updates.length, 2);
  assert.equal(f.transactions(), 2);
});
