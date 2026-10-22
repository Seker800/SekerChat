import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { EmailCodeAuthService } from './email-code-auth.service';

function fixture(existing = false, registrationOpen = 'false', whitelist = '') {
  let created = false;
  const service = new EmailCodeAuthService({
    user: {
      findUnique: async () => existing ? { id: 'user', email: 'member@example.com', disabledAt: null } : null,
      count: async () => 5,
      create: async () => { created = true; return { id: 'new' }; },
      update: async () => ({ id: 'user' }),
    },
    authCode: {
      create: async () => { created = true; },
      findFirst: async () => ({ id: 'code', code: createHmac('sha256', 'secret').update('member@example.com:123456').digest('hex') }),
      updateMany: async () => ({ count: 1 }),
    },
  } as never, { get: () => undefined, getOrThrow: () => 'secret' } as never,
  { enforce: async () => {}, recordSuccess: async () => {} } as never,
  { getRegistrationConfig: async () => ({ registrationOpen, emailWhitelist: whitelist }) } as never);
  return { service, wasCreated: () => created };
}
for (const options of [['false', ''], ['true', 'other@example.com']]) {
  test(`email code registration obeys admission ${options.join(':')}`, async () => {
    const { service, wasCreated } = fixture(false, ...options as [string, string]);
    await assert.rejects(() => service.requestEmailCode('member@example.com'), ForbiddenException);
    await assert.rejects(() => service.consumeEmailCode('member@example.com', '123456', 'local'), ForbiddenException);
    assert.equal(wasCreated(), false);
  });
}
test('closed registration still allows existing users to sign in by a valid code', async () => {
  const { service } = fixture(true);
  assert.equal((await service.consumeEmailCode('member@example.com', '123456', 'local')).id, 'user');
});
