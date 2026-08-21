import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import * as bcrypt from 'bcrypt';

test('listUsers returns the full user directory without invite-candidate filtering', async () => {
  const service = new UsersService(
    {
      user: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          assert.deepEqual(where, { isBot: false });
          return ([
          {
            id: 'user-1',
            email: 'owner@example.com',
            displayName: 'Owner',
            avatarStorageKey: null,
            role: 'SUPER_ADMIN',
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            disabledAt: null,
          },
          {
            id: 'user-2',
            email: 'member@example.com',
            displayName: 'Member',
            avatarStorageKey: 'avatars/member.png',
            role: 'MEMBER',
            createdAt: new Date('2026-05-02T00:00:00.000Z'),
            disabledAt: new Date('2026-05-03T00:00:00.000Z'),
          },
          ]);
        },
      },
    } as any,
    {
      buildUserAvatarUrl: (userId: string, storageKey: string | null) => (storageKey ? `/avatars/${userId}` : null),
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  const result = await service.listUsers({
    sub: 'user-1',
    email: 'owner@example.com',
    role: 'SUPER_ADMIN',
  });

  assert.deepEqual(result, [
    {
      id: 'user-1',
      email: 'owner@example.com',
      displayName: 'Owner',
      role: 'SUPER_ADMIN',
      createdAt: new Date('2026-05-01T00:00:00.000Z'),
      disabledAt: null,
      dndUntil: undefined,
      mustChangePassword: undefined,
      avatarUrl: null,
    },
    {
      id: 'user-2',
      email: 'member@example.com',
      displayName: 'Member',
      role: 'MEMBER',
      createdAt: new Date('2026-05-02T00:00:00.000Z'),
      disabledAt: new Date('2026-05-03T00:00:00.000Z'),
      dndUntil: undefined,
      mustChangePassword: undefined,
      avatarUrl: '/avatars/user-2',
    },
  ]);
});

test('resetUserPassword stores a temporary password and revokes all sessions', async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  const refreshCalls: Array<Record<string, unknown>> = [];
  const deviceCalls: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'member@example.com',
        role: 'MEMBER',
        isBot: false,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateCalls.push(data);
        return {};
      },
    },
    refreshToken: {
      updateMany: async (input: Record<string, unknown>) => {
        refreshCalls.push(input);
        return { count: 2 };
      },
    },
    reminderDeviceToken: {
      updateMany: async (input: Record<string, unknown>) => {
        deviceCalls.push(input);
        return { count: 1 };
      },
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
  };
  const service = new UsersService(
    prisma as any,
    { buildUserAvatarUrl: () => null } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  await service.resetUserPassword(
    { sub: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
    'user-1',
    'TempPass2',
  );

  assert.equal(updateCalls[0].mustChangePassword, true);
  assert.deepEqual(updateCalls[0].authVersion, { increment: 1 });
  assert.equal(await bcrypt.compare('TempPass2', String(updateCalls[0].passwordHash)), true);
  assert.equal(refreshCalls.length, 1);
  assert.equal(deviceCalls.length, 1);
});

test('deleteUser anonymizes the user and revokes tokens', async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  const revokeRefreshCalls: Array<Record<string, unknown>> = [];
  const revokeDeviceCalls: Array<Record<string, unknown>> = [];

  const service = new UsersService(
    {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          email: 'member@example.com',
          role: 'MEMBER',
        }),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updateCalls.push(data);
          return {};
        },
      },
      refreshToken: {
        updateMany: async (input: Record<string, unknown>) => {
          revokeRefreshCalls.push(input);
          return { count: 1 };
        },
      },
      reminderDeviceToken: {
        updateMany: async (input: Record<string, unknown>) => {
          revokeDeviceCalls.push(input);
          return { count: 1 };
        },
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  await service.deleteUser({ sub: 'admin-1', email: 'admin@example.com', role: 'ADMIN' }, 'user-1');

  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].email, 'deleted-user-1@deleted.local');
  assert.equal(updateCalls[0].displayName, null);
  assert.equal(updateCalls[0].passwordHash, null);
  assert.equal(updateCalls[0].avatarStorageKey, null);
  assert.equal(updateCalls[0].oidcProvider, null);
  assert.equal(updateCalls[0].oidcSubject, null);
  assert.notEqual(updateCalls[0].disabledAt, null);
  assert.equal(revokeRefreshCalls.length, 1);
  assert.equal(revokeDeviceCalls.length, 1);
});

test('updateUserRole rejects bot users', async () => {
  const service = new UsersService(
    {
      user: {
        findUnique: async () => ({
          id: 'bot-1',
          email: 'bot@example.com',
          displayName: 'OpenClaw',
          role: 'CLI_BOT',
          isBot: true,
        }),
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  await assert.rejects(
    () => service.updateUserRole({ sub: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' }, 'bot-1', 'ADMIN' as never),
    (error: unknown) => error instanceof BadRequestException && error.message === 'Agent Bot 请在 Bot 管理中维护。',
  );
});

test('deleteUser rejects bot users', async () => {
  const service = new UsersService(
    {
      user: {
        findUnique: async () => ({
          id: 'bot-1',
          email: 'bot@example.com',
          role: 'CLI_BOT',
          isBot: true,
        }),
      },
      refreshToken: {
        updateMany: async () => ({ count: 0 }),
      },
      reminderDeviceToken: {
        updateMany: async () => ({ count: 0 }),
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  await assert.rejects(
    () => service.deleteUser({ sub: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' }, 'bot-1'),
    (error: unknown) => error instanceof BadRequestException && error.message === 'Agent Bot 请在 Bot 管理中维护。',
  );
});

test('setUserDisabled marks a normal member as disabled', async () => {
  const updateCalls: Array<Record<string, unknown>> = [];
  const revokeRefreshCalls: Array<Record<string, unknown>> = [];
  const revokeDeviceCalls: Array<Record<string, unknown>> = [];

  const service = new UsersService(
    {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'member@example.com',
          displayName: 'member',
          role: 'MEMBER',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          avatarStorageKey: null,
          disabledAt: null,
        }),
        update: async ({ data }: { data: { disabledAt: Date | null } }) => {
          updateCalls.push(data);
          return {
            id: 'user-1',
            email: 'member@example.com',
            displayName: 'member',
            role: 'MEMBER',
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
            avatarStorageKey: null,
            disabledAt: data.disabledAt,
          };
        },
      },
      refreshToken: {
        updateMany: async (input: Record<string, unknown>) => {
          revokeRefreshCalls.push(input);
          return { count: 1 };
        },
      },
      reminderDeviceToken: {
        updateMany: async (input: Record<string, unknown>) => {
          revokeDeviceCalls.push(input);
          return { count: 1 };
        },
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  const updated = await service.setUserDisabled(
    { sub: 'admin-1', email: 'admin@example.com', role: 'ADMIN' },
    'user-1',
    true,
  );

  assert.equal(Boolean(updated.disabledAt), true);
  assert.equal(updateCalls.length, 1);
  assert.equal(revokeRefreshCalls.length, 1);
  assert.equal(revokeDeviceCalls.length, 1);
});

test('setUserDisabled rejects bot users', async () => {
  const service = new UsersService(
    {
      user: {
        findUnique: async () => ({
          id: 'bot-1',
          email: 'bot@example.com',
          displayName: 'OpenClaw',
          role: 'CLI_BOT',
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          avatarStorageKey: null,
          disabledAt: null,
          isBot: true,
        }),
      },
      refreshToken: {
        updateMany: async () => ({ count: 0 }),
      },
      reminderDeviceToken: {
        updateMany: async () => ({ count: 0 }),
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  await assert.rejects(
    () => service.setUserDisabled({ sub: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' }, 'bot-1', true),
    (error: unknown) => error instanceof BadRequestException && error.message === 'Agent Bot 请在 Bot 管理中维护。',
  );
});

test('listDMCandidates returns other enabled users only', async () => {
  let capturedWhere: Record<string, unknown> | null = null;
  const service = new UsersService(
    {
      user: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          capturedWhere = where;
          return ([
          {
            id: 'user-2',
            email: 'alpha@example.com',
            displayName: 'Alpha',
            avatarStorageKey: null,
            role: 'MEMBER',
            isBot: false,
            botConfig: null,
          },
          {
            id: 'user-3',
            email: 'beta@example.com',
            displayName: null,
            avatarStorageKey: 'avatars/beta.png',
            role: 'CLI_BOT',
            isBot: true,
            botConfig: { chatEnabled: true },
          },
          ]);
        },
      },
    } as any,
    {
      buildUserAvatarUrl: (userId: string, storageKey: string | null) => (storageKey ? `/avatars/${userId}` : null),
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  const result = await service.listDMCandidates({
    sub: 'user-1',
    email: 'self@example.com',
    role: 'MEMBER',
  });

  assert.deepEqual(capturedWhere, {
    id: { not: 'user-1' },
    disabledAt: null,
    OR: [
      { isBot: false },
      { role: 'CLI_BOT', isBot: true },
    ],
  });

  assert.deepEqual(result, [
    {
      id: 'user-2',
      email: 'alpha@example.com',
      displayName: 'Alpha',
      avatarUrl: null,
    },
    {
      id: 'user-3',
      email: 'beta@example.com',
      displayName: null,
      avatarUrl: '/avatars/user-3',
    },
  ]);
});

test('updateUserRole ignores disabled super admins when protecting the last active super admin', async () => {
  const service = new UsersService(
    {
      user: {
        findUnique: async () => ({
          id: 'super-admin-2',
          email: 'active@example.com',
          displayName: 'Active Admin',
          role: 'SUPER_ADMIN',
        }),
      },
      refreshToken: {
        updateMany: async () => ({ count: 0 }),
      },
      reminderDeviceToken: {
        updateMany: async () => ({ count: 0 }),
      },
      countCalls: [] as any[],
    } as any,
    {
      buildUserAvatarUrl: () => null,
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        ADMIN: ['manage_user_roles'],
        SUPER_ADMIN: ['manage_user_roles'],
      }),
    } as any,
  );

  const prismaMock = (service as any).prismaService;
  prismaMock.user.count = async ({ where }: { where: Record<string, unknown> }) => {
    assert.deepEqual(where, { role: 'SUPER_ADMIN', disabledAt: null });
    return 1;
  };

  await assert.rejects(
    () => service.updateUserRole({ sub: 'super-admin-1', email: 'owner@example.com', role: 'SUPER_ADMIN' }, 'super-admin-2', 'ADMIN' as never),
    (error: unknown) => error instanceof BadRequestException && error.message === '至少需要保留一位超级管理员。',
  );
});
