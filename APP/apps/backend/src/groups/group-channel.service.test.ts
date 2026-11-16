import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { GroupChannelService } from './group-channel.service';

test('archiveGroup delegates the complete transition to the lifecycle application service', async () => {
  const commands: Array<Record<string, unknown>> = [];
  const prisma = {
    user: { findUnique: async () => ({ displayName: '管理员', email: 'admin@example.com' }) },
  };
  const archiveGroupApplicationService = {
    execute: async (command: Record<string, unknown>) => {
      commands.push(command);
      return { changed: true, archivedAt: new Date() };
    },
  };
  const service = new GroupChannelService(
    prisma as never,
    { assertPermission: async () => undefined } as never,
    {
      getMembershipOrThrow: async () => undefined,
      ensureGroupNotDM: async () => undefined,
    } as never,
    {} as never,
    {} as never,
    { createSystemMessage: async () => undefined } as never,
    archiveGroupApplicationService as never,
    {} as never,
  );

  await service.archiveGroup(
    { sub: 'admin-1', role: 'ADMIN' } as never,
    'group-1',
    true,
    async () => ({ id: 'group-1', archivedAt: new Date() }),
  );

  assert.equal(commands.length, 1);
  assert.equal(commands[0].groupId, 'group-1');
  assert.equal(commands[0].archive, true);
  assert.equal(commands[0].reason, 'manual');
});

function buildAdminJoinService(groupOverrides: Record<string, unknown> = {}) {
  const createdMemberships: Array<Record<string, unknown>> = [];
  const prisma = {
    group: {
      findUnique: async () => ({
        id: 'group-1',
        isDM: false,
        archivedAt: null,
        ...groupOverrides,
      }),
      update: async () => undefined,
    },
    groupMember: {
      findUnique: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        createdMemberships.push(data);
      },
    },
    user: { findUnique: async () => ({ displayName: '管理员', email: 'admin@example.com' }) },
  };
  const service = new GroupChannelService(
    prisma as never,
    { assertPermission: async () => undefined } as never,
    {} as never,
    {} as never,
    {
      invalidateGroupMemberCache: async () => undefined,
      publishGroupUpdated: async () => undefined,
    } as never,
    { createSystemMessage: async () => undefined } as never,
    {} as never,
    {} as never,
  );

  return { createdMemberships, service };
}

test('admin self-join adds a regular ADMIN as MEMBER', async () => {
  const { createdMemberships, service } = buildAdminJoinService();

  await service.adminJoinGroup({ sub: 'admin-1', role: 'ADMIN' } as never, 'group-1', async () => ({
    id: 'group-1',
  }));

  assert.equal(createdMemberships.length, 1);
  assert.equal(createdMemberships[0].role, 'MEMBER');
});

test('admin self-join rejects archived channels for non-super admins', async () => {
  const { service } = buildAdminJoinService({ archivedAt: new Date() });

  await assert.rejects(
    () =>
      service.adminJoinGroup({ sub: 'admin-1', role: 'ADMIN' } as never, 'group-1', async () => ({
        id: 'group-1',
      })),
    /归档/,
  );
});

test('super admin self-join keeps the ADMIN role even when archived', async () => {
  const { createdMemberships, service } = buildAdminJoinService({ archivedAt: new Date() });

  await service.adminJoinGroup(
    { sub: 'super-1', role: 'SUPER_ADMIN' } as never,
    'group-1',
    async () => ({ id: 'group-1' }),
  );

  assert.equal(createdMemberships.length, 1);
  assert.equal(createdMemberships[0].role, 'ADMIN');
});
