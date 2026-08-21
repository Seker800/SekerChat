import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthController } from './auth.controller';
import { UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { BrowserOriginGuard } from './guards/browser-origin.guard';

test('legacy browser session endpoints require trusted-origin validation', () => {
  const cookieSessionMethods: Array<keyof AuthController> = [
    'register',
    'login',
    'verifyCode',
    'completeImplicitOidcLogin',
  ];

  for (const methodName of cookieSessionMethods) {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AuthController.prototype[methodName],
    ) as unknown[] | undefined;
    assert.equal(
      guards?.includes(BrowserOriginGuard),
      true,
      `${String(methodName)} must use BrowserOriginGuard`,
    );
  }
});

test('legacy browser login writes credentials only to HttpOnly cookies', async () => {
  const cookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
  const session = {
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
  const controller = new AuthController(
    {
      getAppBaseUrl: () => 'https://im.example.com',
      login: async () => session,
    } as any,
    {} as any,
    {} as any,
    {
      writeSession: (_response: unknown, value: typeof session) => {
        cookies.push(
          {
            name: 'sekerchat_access',
            value: value.accessToken,
            options: { httpOnly: true, secure: true },
          },
          {
            name: 'sekerchat_refresh',
            value: value.refreshToken,
            options: { httpOnly: true, secure: true },
          },
        );
      },
      presentSession: (value: typeof session) => ({ user: value.user }),
    } as any,
  );
  const response = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      cookies.push({ name, value, options });
    },
  };

  const result = await controller.login(
    { email: 'user@example.com', password: 'Password1' },
    { ip: '127.0.0.1' } as any,
    response as any,
  );

  assert.deepEqual(result, { user: session.user });
  assert.deepEqual(
    cookies.map(({ name, value, options }) => ({
      name,
      value,
      httpOnly: options.httpOnly,
      secure: options.secure,
    })),
    [
      { name: 'sekerchat_access', value: 'access-secret', httpOnly: true, secure: true },
      { name: 'sekerchat_refresh', value: 'refresh-secret', httpOnly: true, secure: true },
    ],
  );
});

test('reminder realtime ticket exchange accepts the device token only from its dedicated header', async () => {
  const received: string[] = [];
  const controller = new AuthController(
    {
      issueReminderRealtimeTicket: async (token: string) => {
        received.push(token);
        return { ticket: 'one-time-ticket', expiresAt: new Date('2026-08-11T10:01:00.000Z') };
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  const result = await controller.issueReminderRealtimeTicket('long-device-token');
  assert.deepEqual(received, ['long-device-token']);
  assert.equal(result.ticket, 'one-time-ticket');
  assert.throws(() => controller.issueReminderRealtimeTicket(undefined), UnauthorizedException);
});

test('changePassword disconnects old realtime sessions after the response is sent', async () => {
  const responseListeners = new Map<string, () => void>();
  const disconnectedUserIds: string[] = [];
  const controller = new AuthController(
    {
      getAppBaseUrl: () => 'https://im.example.com',
      changePassword: async () => ({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          role: 'MEMBER',
          mustChangePassword: false,
        },
      }),
    } as any,
    {
      disconnectRealtimeSessions: (userId: string) => {
        disconnectedUserIds.push(userId);
      },
    } as any,
    {} as any,
    {
      writeSession: () => undefined,
      presentSession: (session: { user: unknown }) => ({ user: session.user }),
    } as any,
  );
  const response = {
    cookie: () => undefined,
    once: (event: string, listener: () => void) => {
      responseListeners.set(event, listener);
      return response;
    },
  };

  await controller.changePassword(
    { user: { sub: 'user-1' } } as any,
    { currentPassword: 'OldPass1', newPassword: 'NewPass2' },
    response as any,
  );

  assert.deepEqual(disconnectedUserIds, []);
  responseListeners.get('finish')?.();
  responseListeners.get('close')?.();
  assert.deepEqual(disconnectedUserIds, ['user-1']);
});
