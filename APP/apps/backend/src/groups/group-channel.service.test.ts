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
