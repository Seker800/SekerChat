import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextFor(method: string, originalUrl: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, originalUrl }),
    }),
  } as any;
}

test('temporary-password users can read their account and change their password', () => {
  const guard = new JwtAuthGuard();
  const user = {
    sub: 'user-1',
    email: 'member@example.com',
    role: 'MEMBER',
    mustChangePassword: true,
  };

  assert.equal(
    guard.handleRequest(null, user, null, contextFor('GET', '/api/users/me')),
    user,
  );
  assert.equal(
    guard.handleRequest(null, user, null, contextFor('PATCH', '/api/auth/me/password')),
    user,
  );
  assert.equal(
    guard.handleRequest(null, user, null, contextFor('PATCH', '/api/auth/browser/me/password')),
    user,
  );
});

test('temporary-password users cannot access other protected APIs', () => {
  const guard = new JwtAuthGuard();
  const user = {
    sub: 'user-1',
    email: 'member@example.com',
    role: 'MEMBER',
    mustChangePassword: true,
  };

  assert.throws(
    () => guard.handleRequest(null, user, null, contextFor('GET', '/api/groups')),
    (error: unknown) =>
      error instanceof ForbiddenException && error.message === '必须先修改临时密码。',
  );
});
