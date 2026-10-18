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
