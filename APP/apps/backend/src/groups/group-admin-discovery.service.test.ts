import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { GroupAdminDiscoveryService } from './group-admin-discovery.service';

test('listAdminDiscoverableGroups excludes channels in hidden Servers and keeps search filters', async () => {
  let capturedWhere: unknown = null;
  const service = new GroupAdminDiscoveryService(
    {
      group: {
        findMany: async ({ where }: { where: unknown }) => {
          capturedWhere = where;
          return [];
        },
      },
    } as never,
    { buildServerAvatarUrl: () => null } as never,
    { assertPermission: async () => undefined } as never,
  );

  await service.listAdminDiscoverableGroups(
    { sub: 'admin-1', role: 'ADMIN' },
    'all',
    '需求',
    undefined,
    'server-1',
  );

  const where = capturedWhere as { AND?: unknown[]; serverId?: string; isDM?: boolean };
  assert.equal(where.isDM, false);
  assert.equal(where.serverId, 'server-1');
  assert.ok(Array.isArray(where.AND));
  assert.equal(where.AND?.length, 2);
  assert.deepEqual(where.AND?.at(-1), {
    OR: [{ serverId: null }, { server: { hiddenAt: null } }],
  });
});
