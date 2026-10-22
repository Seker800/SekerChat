import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PrismaService } from './prisma/prisma.service';
import { DmService } from './dm/dm.service';
import { GroupMembershipService } from './groups/group-membership.service';
import { SubscriptionsService } from './subscriptions/subscriptions.service';
import { FileRetirementService } from './files/file-retirement.service';

const url = process.env.TEST_DATABASE_URL;
if (url && !['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname)) {
  throw new Error('Review integration tests require an isolated loopback database.');
}

test('PostgreSQL preserves DM uniqueness, the last admin, publish state and file references under concurrency', { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const suffix = randomUUID();
    const [actor, first, second] = await Promise.all(['actor', 'first', 'second'].map((name) => prisma.user.create({ data: { email: `${name}-${suffix}@review.test` } })));
    const dm = new DmService(prisma, { serializeGroup: async (group: unknown) => group } as never, {} as never);
    const conversations = await Promise.all(Array.from({ length: 8 }, () => dm.createOrGetDM(first.id, second.id)));
    assert.equal(new Set(conversations.map((group) => group.id)).size, 1);
    const server = await prisma.server.create({ data: { name: `review-${suffix}` } });
    const group = await prisma.group.create({ data: { name: 'review', serverId: server.id, createdById: actor.id,
      members: { create: [{ userId: actor.id, role: 'MEMBER' }, { userId: first.id, role: 'ADMIN' }, { userId: second.id, role: 'ADMIN' }] } } });
    const membership = new GroupMembershipService(prisma, { assertPermission: async () => {} } as never,
      { invalidateGroupMemberCache: () => {}, publishGroupUpdated: async () => {} } as never,
      { createSystemMessage: async () => {} } as never, {} as never);
    const removals = await Promise.allSettled([first, second].map((target) => membership.removeMember({ sub: actor.id, role: 'SUPER_ADMIN' } as never, group.id, target.id, async () => ({}))));
    assert.equal(removals.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await prisma.groupMember.count({ where: { groupId: group.id, role: 'ADMIN' } }), 1);
    const post = await prisma.subscriptionPost.create({ data: { title: 'Concurrent publish', body: '', authorId: actor.id } });
    const subscriptions = new SubscriptionsService(prisma, { assertPermission: async () => {} } as never,
      { enqueue: async () => ({}) } as never, {} as never);
    const publications = await Promise.allSettled(Array.from({ length: 4 }, () => subscriptions.publish({ sub: actor.id, role: 'ADMIN' } as never, post.id)));
    assert.equal(publications.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(await prisma.subscriptionAuditLog.count({ where: { postId: post.id, action: 'published' } }), 1);
    const retirement = new FileRetirementService(prisma, {} as never);
    for (let index = 0; index < 8; index++) {
      const file = await prisma.fileObject.create({ data: { storageKey: `${group.id}/${randomUUID()}`, originalName: 'file', mimeType: 'text/plain', size: 1n, groupId: group.id, uploaderId: actor.id, attachedAt: new Date() } });
      await Promise.allSettled([
        retirement.retire(file.id),
        prisma.message.create({ data: { groupId: group.id, senderId: actor.id, type: 'FILE', attachmentFileId: file.id } }),
      ]);
      const referenced = await prisma.message.count({ where: { attachmentFileId: file.id } });
      const eventCount = await prisma.outboxEvent.count({ where: { aggregateId: file.id, eventType: 'file.objects-delete-requested.v1' } });
      const exists = await prisma.fileObject.count({ where: { id: file.id } });
      assert.equal(exists + eventCount, 1);
      if (referenced) { assert.equal(exists, 1); assert.equal(eventCount, 0); }
    }
  } finally { await prisma.$disconnect(); }
});
