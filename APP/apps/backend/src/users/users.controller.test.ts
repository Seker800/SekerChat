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

test('setUserDisabled disconnects realtime sessions only when disabling', async () => {
  const calls: string[] = [];
  const controller = new UsersController(
    {
      setUserDisabled: async (_actor: unknown, userId: string, disabled: boolean) => {
        calls.push(`disable:${userId}:${disabled}`);
        return { id: userId };
      },
    } as any,
    {} as any,
    {
      disconnectSessions: (userId: string) => {
        calls.push(`disconnect:${userId}`);
      },
    } as any,
  );

  await controller.setUserDisabled(
    { sub: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
    'user-1',
    { disabled: true },
  );
  await controller.setUserDisabled(
    { sub: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
    'user-2',
    { disabled: false },
  );

  assert.deepEqual(calls, [
    'disable:user-1:true',
    'disconnect:user-1',
    'disable:user-2:false',
  ]);
});

test('deleteUser disconnects realtime sessions after deletion', async () => {
  const calls: string[] = [];
  const controller = new UsersController(
    {
      deleteUser: async (_actor: unknown, userId: string) => {
        calls.push(`delete:${userId}`);
      },
    } as any,
    {} as any,
    {
      disconnectSessions: (userId: string) => {
        calls.push(`disconnect:${userId}`);
      },
    } as any,
  );

  const result = await controller.deleteUser(
    { sub: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
    'user-1',
  );

  assert.deepEqual(calls, ['delete:user-1', 'disconnect:user-1']);
  assert.deepEqual(result, { success: true });
});
