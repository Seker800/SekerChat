import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GroupMembershipService } from './group-membership.service';

function fixture(isDM = false, targetRole = 'ADMIN', admins = 1) {
  let deleted = false;
  const tx = {
    $queryRaw: async () => [{ id: 'group', isDM }],
    group: { findUnique: async () => ({ isDM }), update: async () => ({}) },
    groupMember: {
      findUnique: async ({ where }: { where: { groupId_userId: { userId: string } } }) => ({
        userId: where.groupId_userId.userId,
        role: where.groupId_userId.userId === 'actor' ? 'MEMBER' : targetRole,
      }),
      count: async () => admins,
      delete: async () => { deleted = true; },
    },
    user: { findMany: async () => [{ id: 'actor', displayName: 'Actor' }] },
  };
  const prisma = { ...tx, $transaction: async (fn: ((tx: unknown) => unknown) | unknown[]) => Array.isArray(fn) ? Promise.all(fn) : fn(tx) };
  const service = new GroupMembershipService(prisma as never, {
    assertPermission: async (_role: string, permission: string) => {
      if (permission === 'manage_user_roles') throw new ForbiddenException();
    },
  } as never, { invalidateGroupMemberCache: () => {}, publishGroupUpdated: async () => {} } as never, { createSystemMessage: async () => {} } as never, {} as never);
  return { service, wasDeleted: () => deleted };
}

test('DM leave is rejected without deleting either participant', async () => {
  const { service, wasDeleted } = fixture(true);
  await assert.rejects(() => service.leaveGroup('actor', 'group'), BadRequestException);
  assert.equal(wasDeleted(), false);
});

test('ordinary members cannot remove an administrator', async () => {
  const { service, wasDeleted } = fixture(false, 'ADMIN', 2);
  await assert.rejects(() => service.removeMember({ sub: 'actor', role: 'MEMBER' } as never, 'group', 'target', async () => ({})), ForbiddenException);
  assert.equal(wasDeleted(), false);
});
