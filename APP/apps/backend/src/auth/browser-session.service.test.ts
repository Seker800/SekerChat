import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserSessionService } from './browser-session.service';

test('browser session cookies are HttpOnly, secure on HTTPS, and path-scoped', () => {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const service = new BrowserSessionService({
    getOrThrow: (key: string) => ({
      APP_BASE_URL: 'https://im.example.com',
      JWT_ACCESS_TTL: '12h',
      JWT_REFRESH_TTL: '7d',
    })[key],
  } as any);
  service.writeSession({
    cookie: (name: string, value: string, options: Record<string, unknown>) => cookies.push({ name, value, options }),
  } as any, {
    accessToken: 'access-secret',
    refreshToken: 'refresh-secret',
    user: { id: 'user-1', email: 'u@example.com', displayName: 'U', role: 'MEMBER', mustChangePassword: false },
  } as any);

  assert.equal(cookies.length, 2);
  assert.deepEqual(cookies.map(({ options }) => ({
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  })), [
    { httpOnly: true, secure: true, sameSite: 'lax', path: '/' },
    { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/auth' },
  ]);
});
