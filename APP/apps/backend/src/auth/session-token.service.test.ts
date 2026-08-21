import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionTokenService } from './session-token.service';

function makeService(overrides?: {
  updateUser?: (args: any) => Promise<any>;
  createRefreshToken?: (args: any) => Promise<any>;
  findRefreshToken?: (args: any) => Promise<any>;
  revokeRefreshToken?: (args: any) => Promise<any>;
  revokeRefreshTokens?: (args: any) => Promise<any>;
  signAccessToken?: (payload: any) => Promise<string>;
  verifyRefreshToken?: (token: string) => any;
}) {
  return new SessionTokenService(
    {
      user: {
        update: overrides?.updateUser ?? (async ({ where }: any) => ({
          id: where.id,
          email: 'user@example.com',
          displayName: 'User',
          role: 'MEMBER',
          disabledAt: null,
          dndUntil: null,
        })),
      },
      refreshToken: {
        create: overrides?.createRefreshToken ?? (async () => undefined),
        findFirst: overrides?.findRefreshToken ?? (async () => null),
        update: overrides?.revokeRefreshToken ?? (async () => undefined),
        updateMany: overrides?.revokeRefreshTokens ?? (async () => ({ count: 0 })),
      },
    } as any,
    {
      getOrThrow: (key: string) => {
        if (key === 'JWT_REFRESH_TTL') return '7d';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
        throw new Error(`unexpected config key ${key}`);
      },
    } as any,
    {
      signAsync: overrides?.signAccessToken ?? (async () => 'access-token'),
      sign: () => 'refresh-token',
      verify: overrides?.verifyRefreshToken ?? (() => ({ authVersion: 0 })),
    } as any,
  );
}

test('createSession resets notification switch to enabled on real login', async () => {
  const updates: any[] = [];
  const service = makeService({
    updateUser: async (args) => {
      updates.push(args);
      return {
        id: args.where.id,
        email: 'user@example.com',
        displayName: 'User',
        role: 'MEMBER',
        disabledAt: null,
        dndUntil: null,
      };
    },
  });

  await service.createSession({
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
    role: 'MEMBER',
    disabledAt: null,
  } as any);

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    where: { id: 'user-1' },
    data: { dndUntil: null },
  });
});

test('createSession keeps current notification switch on refresh rotation', async () => {
  const updates: any[] = [];
  const service = makeService({
    updateUser: async (args) => {
      updates.push(args);
      return {
        id: args.where.id,
        email: 'user@example.com',
        displayName: 'User',
        role: 'MEMBER',
        disabledAt: null,
        dndUntil: null,
      };
    },
  });

  await service.createSession({
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
    role: 'MEMBER',
    disabledAt: null,
  } as any, 'refresh-token-id');

  assert.equal(updates.length, 0);
});

test('createSession keeps current notification switch after password change', async () => {
  const updates: any[] = [];
  const service = makeService({
    updateUser: async (args) => {
      updates.push(args);
      return {
        id: args.where.id,
        email: 'user@example.com',
        displayName: 'User',
        role: 'MEMBER',
        disabledAt: null,
        dndUntil: null,
      };
    },
  });

  await service.createSession({
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
    role: 'MEMBER',
    disabledAt: null,
  } as any, undefined, true);

  assert.equal(updates.length, 0);
});

test('createSession signs the current authVersion into the access token', async () => {
  const payloads: any[] = [];
  const service = makeService({
    signAccessToken: async (payload) => {
      payloads.push(payload);
      return 'access-token';
    },
  });

  await service.createSession({
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
    role: 'MEMBER',
    disabledAt: null,
    authVersion: 3,
  } as any, undefined, true);

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].authVersion, 3);
});

test('refreshSession rejects and revokes a refresh token from an older authVersion', async () => {
  const revocations: any[] = [];
  const service = makeService({
    findRefreshToken: async () => ({
      id: 'refresh-1',
      user: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        role: 'MEMBER',
        disabledAt: null,
        authVersion: 2,
      },
    }),
    verifyRefreshToken: () => ({ authVersion: 1 }),
    revokeRefreshTokens: async (args) => {
      revocations.push(args);
      return { count: 1 };
    },
  });

  await assert.rejects(
    () => service.refreshSession('stale-refresh-token'),
    (error: unknown) =>
      error instanceof Error && error.message === '登录状态已失效，请重新登录。',
  );
  assert.equal(revocations.length, 1);
  assert.deepEqual(revocations[0].where, { id: 'refresh-1', revokedAt: null });
});
