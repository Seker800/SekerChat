import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnauthorizedException } from '@nestjs/common';
import { AuthUserService } from './auth-user.service';

function makeService(authVersion: number) {
  return new AuthUserService({
    user: {
      findUnique: async () => ({
        email: 'user@example.com',
        displayName: 'User',
        role: 'MEMBER',
        isBot: false,
        disabledAt: null,
        mustChangePassword: false,
        authVersion,
      }),
    },
  } as any);
}

test('resolveValidatedUser accepts legacy access tokens while authVersion remains zero', async () => {
  const service = makeService(0);

  const payload = await service.resolveValidatedUser({
    sub: 'user-1',
    email: 'stale@example.com',
    role: 'MEMBER',
  });

  assert.equal(payload.authVersion, 0);
  assert.equal(payload.email, 'user@example.com');
});

test('resolveValidatedUser rejects access tokens issued before a credential change', async () => {
  const service = makeService(1);

  await assert.rejects(
    () => service.resolveValidatedUser({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'MEMBER',
      authVersion: 0,
    }),
    (error: unknown) =>
      error instanceof UnauthorizedException
      && error.message === '登录状态已失效，请重新登录。',
  );
});
