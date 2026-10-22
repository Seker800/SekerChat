import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { assertReadableGroupMembership } from './group-access';
import { hasSystemPermission } from '@sekerchat/shared';

for (const role of ['MEMBER', 'ADMIN', 'SUPER_ADMIN']) {
  for (const isDM of [false, true]) {
    test(`group read boundary: ${role}, DM=${isDM}`, async () => {
      const prisma = { group: { findFirst: async () => null, findUnique: async () => ({ id: 'group', isDM }) } };
      const read = () => assertReadableGroupMembership(prisma as never, { warn: () => {} } as never, 'user', 'group', 'denied', role);
      if (role === 'SUPER_ADMIN' && !isDM) assert.equal((await read()).id, 'group');
      else await assert.rejects(read, ForbiddenException);
    });
  }
}
test('a participant can read a DM while missing groups and missing permissions remain denied', async () => {
  const prisma = { group: { findFirst: async () => ({ id: 'dm' }) } };
  assert.equal((await assertReadableGroupMembership(prisma as never, {} as never, 'member', 'dm', 'denied', 'MEMBER')).id, 'dm');
  assert.equal(hasSystemPermission(null, 'MEMBER', 'manage_system_config'), false);
  assert.equal(hasSystemPermission({}, 'ADMIN', 'manage_system_config'), false);
  assert.equal(hasSystemPermission({ MEMBER: ['manage_system_config'] }, 'MEMBER', 'manage_system_config'), true);
  assert.equal(hasSystemPermission(null, 'SUPER_ADMIN', 'manage_system_config'), true);
});
