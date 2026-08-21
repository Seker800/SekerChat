import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { TokenAuthController } from './token-auth.controller';

test('machine token login returns access and refresh tokens without writing cookies', async () => {
  const session = {
    accessToken: 'machine-access',
    refreshToken: 'machine-refresh',
    user: { id: 'user-1', email: 'user@example.com', displayName: 'User', role: 'MEMBER' },
  };
  const controller = new TokenAuthController({ login: async () => session } as any);

  assert.deepEqual(
    await controller.login(
      { email: 'user@example.com', password: 'password' },
      { ip: '127.0.0.1' } as any,
    ),
    session,
  );
});
