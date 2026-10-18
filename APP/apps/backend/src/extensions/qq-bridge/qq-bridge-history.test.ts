import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QqBridgeIngestService } from './qq-bridge-ingest.service';

const actor = { sub: 'admin', role: 'SUPER_ADMIN' } as never;
const dto = {
  bindingId: 'binding',
  revision: 2,
  messageId: '123',
  senderId: '456',
  displayName: '测试群友',
  occurredAt: '2026-01-01T00:00:00.000Z',
  parts: [{ type: 'text' as const, text: '历史样本' }],
};

function fixture() {
  const created: unknown[] = [];
  const binding = {
    id: 'binding',
    connectorId: 'connector',
    groupId: 'group',
    accountId: '789',
    enabledAt: new Date(),
  };
  const tx = {
    qqBridgeSource: {
      findUnique: async () => null,
      create: async () => ({ id: 'source' }),
      update: async () => {},
    },
    qqBridgeDelivery: { findFirst: async () => null },
    fileObject: { findMany: async () => [] },
  };
  const access = {
    assertAdmin: async () => {},
    assertGroupManager: async () => {},
    activeBinding: async () => binding,
  };
  const service = new QqBridgeIngestService(
    {
      qqBridgeBinding: { findUniqueOrThrow: async () => binding },
      $transaction: async (fn: (value: unknown) => unknown) => fn(tx),
    } as never,
    access as never,
    {
      getActor: async () => ({ id: 'integration' }),
      create: async (_tx: unknown, input: unknown) => {
        created.push(input);
        return { id: 'message' };
      },
    } as never,
    { notify: () => {} } as never,
  );
  return { service, access, created };
}

test('live ingress still rejects pre-enable messages; explicit administrator history import preserves source time', async () => {
  const { service, created } = fixture();
  assert.equal((await service.ingest('connector', dto)).skipped, 'before-enabled');
  assert.equal(created.length, 0);
  await service.importHistory(actor, 'binding', dto);
  assert.equal(created.length, 1);
  assert.equal(
    (created[0] as { author: { occurredAt: string } }).author.occurredAt,
    dto.occurredAt,
  );
});

test('history import requires both configuration and target group permissions and rejects a mismatched binding', async () => {
  const { service, access, created } = fixture();
  access.assertAdmin = async () => {
    throw new Error('configuration denied');
  };
  await assert.rejects(() => service.importHistory(actor, 'binding', dto), /configuration denied/);
  access.assertAdmin = async () => {};
  await assert.rejects(() => service.importHistory(actor, 'other-binding', dto), /不一致/);
  access.assertGroupManager = async () => {
    throw new Error('group denied');
  };
  await assert.rejects(() => service.importHistory(actor, 'binding', dto), /group denied/);
  assert.equal(created.length, 0);
});

test('administrator history import still validates active connector, binding and revision', async () => {
  const { service, access, created } = fixture();
  access.activeBinding = async () => {
    throw new Error('inactive or stale');
  };
  await assert.rejects(() => service.importHistory(actor, 'binding', dto), /inactive or stale/);
  assert.equal(created.length, 0);
});
