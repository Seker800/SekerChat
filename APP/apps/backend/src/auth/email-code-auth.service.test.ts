import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { EmailCodeAuthService } from './email-code-auth.service';

function hashCode(email: string, code: string): string {
  return createHmac('sha256', 'test-access-secret').update(`${email}:${code}`).digest('hex');
}

test('consumeEmailCode assigns ADMIN role for emails in ADMIN_EMAILS', async () => {
  const createCalls: Array<Record<string, unknown>> = [];

  const service = new EmailCodeAuthService(
    {
      authCode: {
        create: async () => undefined,
        findFirst: async ({ where }: any) =>
          where?.consumedAt === null
            ? {
                id: 'code-1',
                email: 'admin@example.com',
                code: hashCode('admin@example.com', '123456'),
                expiresAt: new Date(Date.now() + 60_000),
                createdAt: new Date(),
                consumedAt: null,
              }
            : null,
        updateMany: async () => ({ count: 1 }),
      },
      user: {
        findUnique: async () => null,
        count: async () => 3,
        create: async (input: Record<string, unknown>) => {
          createCalls.push(input);
          return {
            id: 'user-1',
            email: 'admin@example.com',
            displayName: 'admin',
            role: 'ADMIN',
          };
        },
      },
    } as any,
    {
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        throw new Error(`unexpected key ${key}`);
      },
      get: (key: string) => {
        if (key === 'ADMIN_EMAILS') return 'admin@example.com';
        return undefined;
      },
    } as any,
    {
      checkRisk: async () => ({ status: 'ok' as const }),
      enforce: async () => {},
      recordFailure: async () => {},
      recordSuccess: async () => {},
    } as any,
  );

  const user = await service.consumeEmailCode('admin@example.com', '123456', '1.2.3.4');

  assert.equal(user.role, 'ADMIN');
  assert.equal((createCalls[0]?.data as any)?.role, 'ADMIN');
});

test('consumeEmailCode keeps MEMBER role for non-admin emails', async () => {
  const createCalls: Array<Record<string, unknown>> = [];

  const service = new EmailCodeAuthService(
    {
      authCode: {
        create: async () => undefined,
        findFirst: async ({ where }: any) =>
          where?.consumedAt === null
            ? {
                id: 'code-2',
                email: 'member@example.com',
                code: hashCode('member@example.com', '123456'),
                expiresAt: new Date(Date.now() + 60_000),
                createdAt: new Date(),
                consumedAt: null,
              }
            : null,
        updateMany: async () => ({ count: 1 }),
      },
      user: {
        findUnique: async () => null,
        count: async () => 3,
        create: async (input: Record<string, unknown>) => {
          createCalls.push(input);
          return {
            id: 'user-2',
            email: 'member@example.com',
            displayName: 'member',
            role: 'MEMBER',
          };
        },
      },
    } as any,
    {
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        throw new Error(`unexpected key ${key}`);
      },
      get: (key: string) => {
        return '';
      },
    } as any,
    {
      checkRisk: async () => ({ status: 'ok' as const }),
      enforce: async () => {},
      recordFailure: async () => {},
      recordSuccess: async () => {},
    } as any,
  );

  const user = await service.consumeEmailCode('member@example.com', '123456', '1.2.3.4');

  assert.equal(user.role, 'MEMBER');
  assert.equal((createCalls[0]?.data as any)?.role, 'MEMBER');
});

test('consumeEmailCode does not overwrite an existing SUPER_ADMIN role', async () => {
  const updateCalls: Array<Record<string, unknown>> = [];

  const service = new EmailCodeAuthService(
    {
      authCode: {
        create: async () => undefined,
        findFirst: async ({ where }: any) =>
          where?.consumedAt === null
            ? {
                id: 'code-3',
                email: 'owner@example.com',
                code: hashCode('owner@example.com', '123456'),
                expiresAt: new Date(Date.now() + 60_000),
                createdAt: new Date(),
                consumedAt: null,
              }
            : null,
        updateMany: async () => ({ count: 1 }),
      },
      user: {
        findUnique: async () => ({
          id: 'user-3',
          email: 'owner@example.com',
          displayName: 'owner',
          role: 'SUPER_ADMIN',
          emailVerifiedAt: null,
        }),
        update: async (input: Record<string, unknown>) => {
          updateCalls.push(input);
          return {
            id: 'user-3',
            email: 'owner@example.com',
            displayName: 'owner',
            role: 'SUPER_ADMIN',
            emailVerifiedAt: new Date(),
          };
        },
      },
    } as any,
    {
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        throw new Error(`unexpected key ${key}`);
      },
      get: (key: string) => {
        if (key === 'ADMIN_EMAILS') return 'owner@example.com';
        return undefined;
      },
    } as any,
    {
      checkRisk: async () => ({ status: 'ok' as const }),
      enforce: async () => {},
      recordFailure: async () => {},
      recordSuccess: async () => {},
    } as any,
  );

  const user = await service.consumeEmailCode('owner@example.com', '123456', '1.2.3.4');

  assert.equal(user.role, 'SUPER_ADMIN');
  assert.equal((updateCalls[0]?.data as any)?.role, undefined);
});

test('requestEmailCode stores a hashed code and does not return the raw value', async () => {
  const createCalls: Array<Record<string, unknown>> = [];

  const service = new EmailCodeAuthService(
    {
      authCode: {
        create: async (input: Record<string, unknown>) => {
          createCalls.push(input);
          return undefined;
        },
      },
      user: {
        count: async () => 0,
      },
    } as any,
    {
      getOrThrow: (key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
        throw new Error(`unexpected key ${key}`);
      },
      get: (key: string) => {
        if (key === 'ADMIN_EMAILS') return '';
        return undefined;
      },
    } as any,
    {
      checkRisk: async () => ({ status: 'ok' as const }),
      enforce: async () => {},
      recordFailure: async () => {},
      recordSuccess: async () => {},
    } as any,
  );

  const result = await service.requestEmailCode('member@example.com');

  assert.equal('code' in (result as Record<string, unknown>), false);
  assert.equal(result.deliveryHint.length > 0, true);
  assert.notEqual((createCalls[0]?.data as any)?.code, '123456');
  assert.equal(typeof (createCalls[0]?.data as any)?.code, 'string');
});
