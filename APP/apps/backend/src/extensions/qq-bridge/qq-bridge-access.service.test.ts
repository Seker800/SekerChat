import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QqBridgeAccessService, hashBridgeSecret } from './qq-bridge-access.service';

test('connector credentials are independent from browser JWTs and revoked credentials fail closed', async () => {
  let row: { id: string; revokedAt: Date | null } | null = { id: 'connector', revokedAt: null };
  let lookups = 0;
  const service = new QqBridgeAccessService(
    {
      qqBridgeConnector: {
        findUnique: async () => {
          lookups++;
          return row;
        },
      },
    } as never,
    {} as never,
  );
  await assert.rejects(() => service.authenticate());
  await assert.rejects(() => service.authenticate('Bearer browser.jwt.token'));
  assert.equal(lookups, 0);
  const token = `qqb_${'a'.repeat(64)}`;
  assert.equal((await service.authenticate(`Bearer ${token}`)).id, 'connector');
  row = { id: 'connector', revokedAt: new Date() };
  await assert.rejects(() => service.authenticate(`Bearer ${token}`));
  row = null;
  await assert.rejects(() => service.authenticate(`Bearer ${token}`));
  assert.notEqual(hashBridgeSecret(token), token);
});

test('connector creation checks permissions before issuing a credential', async () => {
  let writes = 0;
  const service = new QqBridgeAccessService(
    {
      qqBridgeConnector: {
        create: async () => {
          writes++;
        },
      },
    } as never,
    {
      assertPermission: async () => {
        throw new Error('forbidden');
      },
    } as never,
  );
  await assert.rejects(
    () => service.createConnector({ role: 'MEMBER' } as never, 'test'),
    /forbidden/,
  );
  assert.equal(writes, 0);
});

test('global extension configuration permission does not grant write access to somebody else’s group', async () => {
  let writes = 0;
  const service = new QqBridgeAccessService(
    {
      group: {
        findUnique: async () => ({ id: 'group', createdById: 'other', members: [], server: null }),
      },
      qqBridgeBinding: {
        create: async () => {
          writes++;
        },
      },
    } as never,
    { assertPermission: async () => {} } as never,
  );
  await assert.rejects(
    () =>
      service.createBinding({ role: 'ADMIN', sub: 'not-owner' } as never, {
        groupId: 'group',
        connectorId: 'connector',
        accountId: '90000001',
        qqGroupId: '90000002',
      }),
    /管理权限/,
  );
  assert.equal(writes, 0);
});

test('hidden Servers are treated as inactive for bridge bindings', async () => {
  const service = new QqBridgeAccessService(
    {
      group: {
        findUnique: async () => ({
          id: 'group',
          createdById: 'super-1',
          members: [],
          isDM: false,
          archivedAt: null,
          server: { archivedAt: null, hiddenAt: new Date() },
        }),
      },
    } as never,
    { assertPermission: async () => undefined } as never,
  );

  await assert.rejects(
    () => service.assertGroupManager({ sub: 'super-1', role: 'SUPER_ADMIN' }, 'group', true),
    /只能绑定有效的普通群/,
  );
});

test('activeBinding refuses bindings whose Server is hidden', async () => {
  const tx = {
    $queryRaw: async () => [],
    qqBridgeBinding: {
      findUnique: async () => ({
        id: 'binding-1',
        connectorId: 'connector-1',
        archivedAt: null,
        enabled: true,
        revision: 1,
        groupId: 'group-1',
        connector: { enabled: true, revokedAt: null },
      }),
    },
    group: {
      findUnique: async () => ({
        id: 'group-1',
        isDM: false,
        archivedAt: null,
        server: { archivedAt: null, hiddenAt: new Date() },
      }),
    },
  };
  const service = new QqBridgeAccessService({} as never, {} as never);

  await assert.rejects(
    () => service.activeBinding(tx as never, 'connector-1', 'binding-1', 1),
    /目标群不可用/,
  );
});
