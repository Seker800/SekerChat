import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { OidcAuthService } from './oidc-auth.service';

const identity = { provider: 'issuer', subject: 'subject', email: 'owner@example.com', displayName: 'Owner', emailVerified: false };
function fixture(linked = false, existing = true) {
  const writes: unknown[] = [];
  const user = { id: 'owner', email: identity.email, role: 'ADMIN', disabledAt: null };
  const service = new OidcAuthService({ user: {
    findFirst: async () => linked ? user : null,
    findUnique: async () => existing ? user : null,
    count: async () => 1,
    update: async (args: unknown) => { writes.push(args); return user; },
    create: async (args: unknown) => { writes.push(args); return user; },
  } } as never, {
    get: (key: string) => key === 'ADMIN_EMAILS' ? identity.email : undefined,
    getOrThrow: () => 'https://chat.example',
  } as never, {} as never, {} as never);
  return { service, writes };
}

test('an unverified OIDC email cannot bind an existing local account', async () => {
  const { service, writes } = fixture();
  await assert.rejects(() => service['findOrCreateOidcUser'](identity), ForbiddenException);
  assert.equal(writes.length, 0);
});
test('an unverified OIDC email cannot create an email-privileged account', async () => {
  const { service, writes } = fixture(false, false);
  await assert.rejects(() => service['findOrCreateOidcUser'](identity), ForbiddenException);
  assert.equal(writes.length, 0);
});
test('verified identities can bind and existing subject bindings remain usable', async () => {
  const verified = fixture();
  assert.equal((await verified.service['findOrCreateOidcUser']({ ...identity, emailVerified: true })).id, 'owner');
  const linked = fixture(true);
  assert.equal((await linked.service['findOrCreateOidcUser'](identity)).id, 'owner');
});
