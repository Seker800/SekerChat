import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserAuthController } from './browser-auth.controller';

function createSession() {
  return {
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    user: {
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User',
      role: 'MEMBER',
      mustChangePassword: false,
    },
  };
}

test('browser login returns user metadata without exposing tokens', async () => {
  const session = createSession();
  const writtenSessions: unknown[] = [];
  const controller = new BrowserAuthController(
    { login: async () => session } as any,
    {
      writeSession: (_response: unknown, nextSession: unknown) => writtenSessions.push(nextSession),
      presentSession: (nextSession: typeof session) => ({ user: nextSession.user }),
    } as any,
    {} as any,
  );

  const response = await controller.login(
    { email: 'user@example.com', password: 'password' },
    { ip: '127.0.0.1' } as any,
    {} as any,
  );

  assert.deepEqual(response, { user: session.user });
  assert.equal('accessToken' in response, false);
  assert.equal('refreshToken' in response, false);
  assert.deepEqual(writtenSessions, [session]);
});

test('browser refresh reads only the HttpOnly cookie contract', async () => {
  const session = createSession();
  const refreshedTokens: string[] = [];
  const controller = new BrowserAuthController(
    {
      refreshSession: async (token: string) => {
        refreshedTokens.push(token);
        return session;
      },
    } as any,
    {
      resolveRefreshCookie: () => 'cookie-refresh-token',
      writeSession: () => undefined,
      presentSession: (nextSession: typeof session) => ({ user: nextSession.user }),
    } as any,
    {} as any,
  );

  await controller.refresh({} as any, {} as any);
  assert.deepEqual(refreshedTokens, ['cookie-refresh-token']);
});
