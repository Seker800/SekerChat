import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { PasswordAuthService } from './password-auth.service';

test('login rejects disabled users', async () => {
  const service = new PasswordAuthService(
    {
      user: {
        findUnique: async () => ({
          id: 'user-1',
          email: 'disabled@example.com',
          passwordHash: '$2b$10$abcdefghijklmnopqrstuv',
          disabledAt: new Date('2026-05-06T00:00:00.000Z'),
        }),
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
      getRegistrationConfig: async () => ({}),
    } as any,
  );

  await assert.rejects(
    () => service.login('disabled@example.com', 'pass123456', '1.2.3.4'),
    (error: unknown) =>
      error instanceof ForbiddenException && error.message === '该账号已停用，请联系管理员',
  );
});
