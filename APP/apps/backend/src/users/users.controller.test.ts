import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsersController } from './users.controller';

test('resetUserPassword disconnects the target user after resetting credentials', async () => {
  const calls: string[] = [];
  const controller = new UsersController(
    {
      resetUserPassword: async (_actor: unknown, userId: string) => {
        calls.push(`reset:${userId}`);
      },
    } as any,
    {} as any,
    {
      disconnectSessions: (userId: string) => {
        calls.push(`disconnect:${userId}`);
      },
    } as any,
  );

  const result = await controller.resetUserPassword(
    { sub: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
    'user-1',
    { newPassword: 'TempPass2' },
  );

  assert.deepEqual(calls, ['reset:user-1', 'disconnect:user-1']);
  assert.deepEqual(result, { success: true });
});
