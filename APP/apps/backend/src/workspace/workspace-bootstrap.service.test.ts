import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { WorkspaceBootstrapService } from './workspace-bootstrap.service';

const user = {
  sub: 'user-1',
  email: 'user@example.com',
  role: 'MEMBER',
};

function createService(overrides: {
  groups?: Array<{ id: string; name?: string }>;
  dms?: Array<{ id: string; name?: string }>;
  calls?: string[];
} = {}) {
  const calls = overrides.calls ?? [];
  const groups = overrides.groups ?? [{ id: 'group-1', name: 'General' }];
  const dms = overrides.dms ?? [{ id: 'dm-1', name: 'Alice' }];

  const service = new WorkspaceBootstrapService(
    {
      listGroups: async (userId: string, role: string) => {
        calls.push(`groups:${userId}:${role}`);
        return groups;
      },
    } as never,
    {
      listDMs: async (userId: string) => {
        calls.push(`dms:${userId}`);
        return dms;
      },
    } as never,
    {
      listMessages: async (userId: string, groupId: string, options: { limit?: number }) => {
        calls.push(`messages:${userId}:${groupId}:${options.limit}`);
        return { groupId, items: [] };
      },
    } as never,
    {
      getVisibleConfig: async (actor: typeof user) => {
        calls.push(`config:${actor.sub}`);
        return { rolePermissions: null };
      },
    } as never,
  );

  return { service, calls };
}

test('getBootstrap combines workspace data for the selected server group', async () => {
  const { service, calls } = createService({
    groups: [{ id: 'group-1' }, { id: 'group-2' }],
  });

  const result = await service.getBootstrap(user, {
    mode: 'server',
    groupId: 'group-2',
    messageLimit: 25,
  });

  assert.equal(result.selectedGroupId, 'group-2');
  assert.deepEqual(result.selectedGroup, { id: 'group-2' });
  assert.equal(result.messages?.groupId, 'group-2');
  assert.ok(calls.includes('groups:user-1:MEMBER'));
  assert.ok(calls.includes('dms:user-1'));
  assert.ok(calls.includes('messages:user-1:group-2:25'));
});

test('getBootstrap falls back to the first visible channel when requested id is stale', async () => {
  const { service } = createService({
    groups: [{ id: 'group-1' }, { id: 'group-2' }],
  });

  const result = await service.getBootstrap(user, {
    mode: 'server',
    groupId: 'missing-group',
  });

  assert.equal(result.selectedGroupId, 'group-1');
  assert.deepEqual(result.selectedGroup, { id: 'group-1' });
});

test('getBootstrap clears the selection when no channels are available', async () => {
  const { service, calls } = createService({
    groups: [],
  });

  const result = await service.getBootstrap(user, {
    mode: 'server',
    groupId: 'missing-group',
  });

  assert.equal(result.selectedGroupId, '');
  assert.equal(result.selectedGroup, null);
  assert.equal(result.messages, null);
  assert.equal(calls.some((call) => call.startsWith('messages:')), false);
});

test('getBootstrap uses dm channels when mode is dm', async () => {
  const { service } = createService({
    dms: [{ id: 'dm-1' }, { id: 'dm-2' }],
  });

  const result = await service.getBootstrap(user, {
    mode: 'dm',
    dmId: 'dm-2',
  });

  assert.equal(result.mode, 'dm');
  assert.equal(result.selectedGroupId, 'dm-2');
});

test('getBootstrap rejects unsafe message limits', async () => {
  const { service } = createService();

  const accepted = await service.getBootstrap(user, { messageLimit: 200 });
  assert.equal(accepted.messages?.groupId, 'group-1');

  await assert.rejects(
    () => service.getBootstrap(user, { messageLimit: 201 }),
    BadRequestException,
  );

  await assert.rejects(
    () => service.getBootstrap(user, { messageLimit: 0 }),
    BadRequestException,
  );
});
