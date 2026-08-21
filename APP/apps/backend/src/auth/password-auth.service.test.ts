import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PasswordAuthService } from './password-auth.service';
import * as bcrypt from 'bcrypt';

test('register accepts emails listed on separate whitelist lines', async () => {
  const createCalls: Array<Record<string, unknown>> = [];

  const service = new PasswordAuthService(
    {
      user: {
        findUnique: async () => null,
        count: async () => 2,
        create: async (input: Record<string, unknown>) => {
          createCalls.push(input);
          return {
            id: 'user-1',
            email: '000@000.com',
            displayName: 'test',
            role: 'MEMBER',
            emailVerifiedAt: new Date(),
          };
        },
      },
    } as any,
    {
      get: () => undefined,
    } as any,
    {
      checkRisk: async () => ({ status: 'ok' as const }),
      enforce: async () => {},
      recordFailure: async () => {},
      recordSuccess: async () => {},
    } as any,
    {
      getRegistrationConfig: async () => ({
        emailWhitelist: '111@111.com\n000@000.com',
        registrationOpen: 'true',
      }),
    } as any,
  );

  const user = await service.register('000@000.com', 'pass123456', 'test');

  assert.equal(user.email, '000@000.com');
  assert.equal((createCalls[0]?.data as any)?.email, '000@000.com');
});

test('register rejects first-user signup unless it matches BOOTSTRAP_SUPER_ADMIN_EMAIL', async () => {
  const service = new PasswordAuthService(
    {
      user: {
        findUnique: async () => null,
        count: async () => 0,
      },
    } as any,
    {
      get: (key: string) => {
        if (key === 'BOOTSTRAP_SUPER_ADMIN_EMAIL') return 'owner@example.com';
        return undefined;
      },
    } as any,
    {
      checkRisk: async () => ({ status: 'ok' as const }),
      enforce: async () => {},
      recordFailure: async () => {},
      recordSuccess: async () => {},
    } as any,
    {
      getRegistrationConfig: async () => ({}),
    } as any,
  );

  await assert.rejects(
    () => service.register('member@example.com', 'Pass1234', 'member'),
    (error: unknown) =>
      error instanceof ForbiddenException &&
      error.message === '首个管理员账号必须使用预配置的引导邮箱创建。',
  );
});

test('changePassword replaces the hash, clears the temporary-password flag, and revokes sessions', async () => {
  const currentHash = await bcrypt.hash('OldPass1', 4);
  const updateCalls: Array<Record<string, unknown>> = [];
  const refreshCalls: Array<Record<string, unknown>> = [];
  const deviceCalls: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'member@example.com',
        passwordHash: currentHash,
        mustChangePassword: true,
      }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updateCalls.push(data);
        return {
          id: 'user-1',
          email: 'member@example.com',
          passwordHash: data.passwordHash,
          mustChangePassword: data.mustChangePassword,
        };
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
  const service = new PasswordAuthService(
    prisma as any,
    { get: () => undefined } as any,
    {
      enforce: async () => {},
      recordFailure: async () => {},
      recordSuccess: async () => {},
    } as any,
    { getRegistrationConfig: async () => ({}) } as any,
  );

  const user = await service.changePassword('user-1', 'OldPass1', 'NewPass2');

  assert.equal(user.mustChangePassword, false);
  assert.equal(updateCalls.length, 1);
  assert.equal(await bcrypt.compare('NewPass2', String(updateCalls[0].passwordHash)), true);
  assert.deepEqual(updateCalls[0].authVersion, { increment: 1 });
  assert.equal(refreshCalls.length, 1);
  assert.equal(deviceCalls.length, 1);
});
