import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { test } from 'node:test';
import { SubscriptionsService } from './subscriptions.service';

const manager = {
  sub: 'manager-1',
  email: 'manager@example.com',
  role: 'ADMIN',
};

function createService(overrides?: {
  post?: Record<string, unknown> | null;
  attachments?: Array<Record<string, unknown>>;
  canManage?: boolean;
  recipient?: Record<string, unknown> | null;
  eligibleUsers?: Array<{ id: string }>;
  attachment?: Record<string, unknown> | null;
}) {
  const post = overrides?.post === undefined
    ? {
        id: 'post-1',
        status: 'DRAFT',
        title: 'Desktop 1.0',
        body: '# First release',
        tags: ['desktop'],
        pinnedAt: null,
        publishedAt: null,
        withdrawnAt: null,
        authorId: manager.sub,
        createdAt: new Date('2026-07-25T00:00:00.000Z'),
        updatedAt: new Date('2026-07-25T00:00:00.000Z'),
        author: { id: manager.sub, email: manager.email, displayName: 'Manager' },
        attachments: overrides?.attachments ?? [],
      }
    : overrides.post;
  const updates: Array<Record<string, unknown>> = [];
  const deletions: string[] = [];
  const readUpserts: Array<{ postId: string; userId: string }> = [];
  const readDeletions: Array<{ postId: string; userId: string }> = [];
  let recipient = overrides?.recipient ?? null;
  const recipientCreates: Array<Record<string, unknown>> = [];
  const recipientUpdates: Array<Record<string, unknown>> = [];
  const eligibleUserQueries: Array<Record<string, unknown>> = [];
  const outboxEvents: Array<Record<string, unknown>> = [];
  const broadcasts: Array<Record<string, unknown>> = [];
  const viewUrlCalls: Array<Record<string, unknown>> = [];
  const downloadUrlCalls: Array<Record<string, unknown>> = [];
  const prisma = {
    subscriptionPost: {
      findFirst: async ({ where }: { where?: { status?: string } } = {}) =>
        where?.status && post?.status !== where.status ? null : post,
      findUnique: async () => post,
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: { data: Record<string, unknown> }) => ({ ...post, ...data }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return { ...post, ...data };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        deletions.push(where.id);
        return post;
      },
    },
    subscriptionReadState: {
      upsert: async ({ where }: { where: { postId_userId: { postId: string; userId: string } } }) => {
        readUpserts.push(where.postId_userId);
        return {};
      },
      deleteMany: async ({ where }: { where: { postId: string; userId: string } }) => {
        readDeletions.push(where);
        return { count: 1 };
      },
    },
    subscriptionPostRecipient: {
      findUnique: async () => recipient,
      findUniqueOrThrow: async () => {
        if (!recipient) throw new Error('Recipient not found.');
        return recipient;
      },
      findMany: async () => [],
      count: async () => 0,
      groupBy: async () => [],
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        recipientCreates.push(...data);
        return { count: data.length };
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        recipientUpdates.push(data);
        if (!recipient) return { count: 0 };
        recipient = { ...recipient, ...data };
        return { count: 1 };
      },
    },
    user: {
      findMany: async ({ where }: { where: { id?: { not?: string } } }) => {
        eligibleUserQueries.push(where);
        return (overrides?.eligibleUsers ?? []).filter(
          (user) => user.id !== where.id?.not,
        );
      },
    },
    subscriptionAuditLog: {
      create: async () => ({}),
    },
    subscriptionAttachment: {
      findFirst: async () => overrides?.attachment ?? null,
      update: async () => ({}),
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prisma),
    $queryRaw: async () => post ? [{ id: post.id, status: post.status }] : [],
  };
  const service = new SubscriptionsService(
    prisma as never,
    {
      hasPermission: async () => overrides?.canManage !== false,
      assertPermission: async () => {
        if (overrides?.canManage === false) {
          throw new ForbiddenException('Insufficient permissions.');
        }
      },
    } as never,
    {
      enqueue: async (_transaction: unknown, event: Record<string, unknown>) => {
        outboxEvents.push(event);
        return {};
      },
    } as never,
    {
      publishSubscriptionChanged: async (payload: Record<string, unknown>) => {
        broadcasts.push(payload);
      },
    } as never,
    {
      createViewUrl: async (storageKey: string, mimeType: string) => {
        viewUrlCalls.push({ storageKey, mimeType });
        return 'https://objects.example/view/image.png';
      },
      createDownloadUrl: async (storageKey: string, mimeType: string, originalName: string) => {
        downloadUrlCalls.push({ storageKey, mimeType, originalName });
        return 'https://objects.example/download/image.png';
      },
    } as never,
  );
  return {
    service,
    updates,
    deletions,
    readUpserts,
    readDeletions,
    recipientCreates,
    recipientUpdates,
    eligibleUserQueries,
    outboxEvents,
    broadcasts,
    viewUrlCalls,
    downloadUrlCalls,
  };
}

test('createDraft requires subscription management permission', async () => {
  const { service } = createService({ canManage: false });
  await assert.rejects(
    () =>
      service.createDraft(manager as never, {
        title: 'Article',
        body: '# Article',
        tags: [],
      }),
    ForbiddenException,
  );
});

test('createDraft rejects members even when the configurable permission is granted', async () => {
  const { service } = createService();
  await assert.rejects(
    () =>
      service.createDraft(
        { ...manager, role: 'MEMBER' } as never,
        { title: 'Article', body: '# Article', tags: [] },
      ),
    ForbiddenException,
  );
});

test('createDraft allows an untitled draft so images can be uploaded before the title is written', async () => {
  const { service } = createService();

  const draft = await service.createDraft(manager as never, {
    title: '',
    body: '',
    tags: [],
  });

  assert.equal(draft.title, '');
  assert.equal(draft.status, 'DRAFT');
});

test('updatePost allows an untitled draft but rejects an empty title for published content', async () => {
  const { service: draftService, updates } = createService();

  await draftService.updatePost(manager as never, 'post-1', { title: '' });
  assert.equal(updates[0]?.title, '');

  const { service: publishedService } = createService({
    post: {
      id: 'post-1',
      status: 'PUBLISHED',
      title: 'Published article',
      body: 'Body',
      tags: [],
      attachments: [],
    },
  });
  await assert.rejects(
    () => publishedService.updatePost(manager as never, 'post-1', { title: '' }),
    BadRequestException,
  );
});

test('publish rejects an untitled draft even though drafts may be saved without a title', async () => {
  const { service } = createService({
    post: {
      id: 'post-1',
      status: 'DRAFT',
      title: '',
      body: 'Body',
      tags: [],
      attachments: [],
    },
  });

  await assert.rejects(() => service.publish(manager as never, 'post-1'), BadRequestException);
});

test('deletePost lets an administrator permanently delete published content', async () => {
  const { service, deletions, broadcasts } = createService({
    post: {
      id: 'post-1',
      status: 'PUBLISHED',
      title: 'Published article',
      attachments: [],
    },
  });

  await service.deletePost(manager as never, 'post-1');

  assert.deepEqual(deletions, ['post-1']);
  assert.deepEqual(broadcasts, [{ postId: 'post-1', reason: 'deleted' }]);
});

test('publish rejects drafts while an attachment upload is incomplete', async () => {
  const { service } = createService({
    attachments: [{ id: 'attachment-1', status: 'UPLOADING' }],
  });
  await assert.rejects(() => service.publish(manager as never, 'post-1'), BadRequestException);
});

test('publish snapshots every active human including the article author', async () => {
  const { service, updates, recipientCreates, eligibleUserQueries, outboxEvents } = createService({
    attachments: [{ id: 'attachment-1', status: 'READY' }],
    eligibleUsers: [{ id: manager.sub }, { id: 'reader-1' }, { id: 'reader-2' }],
  });

  await service.publish(manager as never, 'post-1');

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.status, 'PUBLISHED');
  assert.ok(updates[0]?.publishedAt instanceof Date);
  assert.deepEqual(recipientCreates.map((recipient) => recipient.userId), [
    manager.sub,
    'reader-1',
    'reader-2',
  ]);
  assert.deepEqual(eligibleUserQueries, [{ disabledAt: null, isBot: false }]);
  assert.equal(outboxEvents.length, 1);
  assert.equal(outboxEvents[0]?.eventType, 'subscription.changed.v1');
});

test('confirm records the first confirmation for a snapshotted recipient and enqueues realtime intent', async () => {
  const { service, recipientUpdates, outboxEvents } = createService({
    post: {
      id: 'post-1',
      status: 'PUBLISHED',
      title: 'Published article',
    },
    recipient: {
      postId: 'post-1',
      userId: 'reader-1',
      assignedAt: new Date('2026-07-25T00:00:00.000Z'),
      confirmedAt: null,
    },
  });

  const result = await service.confirm('reader-1', 'post-1', 'confirmation-key-1');

  assert.equal(recipientUpdates.length, 1);
  assert.equal(result.isConfirmed, true);
  assert.ok(result.confirmedAt instanceof Date);
  assert.equal(outboxEvents.length, 1);
  assert.equal(outboxEvents[0]?.eventType, 'subscription.changed.v1');
});

test('confirm rejects a user outside the publication recipient snapshot', async () => {
  const { service } = createService({
    post: { id: 'post-1', status: 'PUBLISHED', title: 'Published article' },
    recipient: null,
  });

  await assert.rejects(
    () => service.confirm('reader-1', 'post-1', 'confirmation-key-1'),
    ForbiddenException,
  );
});

test('confirm preserves the first confirmation time and produces no duplicate event on retry', async () => {
  const confirmedAt = new Date('2026-07-25T01:00:00.000Z');
  const { service, recipientUpdates, outboxEvents } = createService({
    post: { id: 'post-1', status: 'PUBLISHED', title: 'Published article' },
    recipient: {
      postId: 'post-1',
      userId: 'reader-1',
      confirmedAt,
    },
  });

  const result = await service.confirm('reader-1', 'post-1', 'confirmation-key-1');

  assert.equal(result.confirmedAt, confirmedAt);
  assert.equal(recipientUpdates.length, 0);
  assert.equal(outboxEvents.length, 0);
});

test('confirm requires an idempotency key', async () => {
  const { service } = createService({
    post: { id: 'post-1', status: 'PUBLISHED', title: 'Published article' },
    recipient: { postId: 'post-1', userId: 'reader-1', confirmedAt: null },
  });

  await assert.rejects(() => service.confirm('reader-1', 'post-1'), BadRequestException);
});

test('published detail does not expose drafts to ordinary readers', async () => {
  const { service } = createService();
  await assert.rejects(
    () => service.getPublishedPost({ ...manager, sub: 'reader-1', role: 'MEMBER' } as never, 'post-1'),
    NotFoundException,
  );
});

test('opening published detail does not mark it confirmed', async () => {
  const { service, readUpserts } = createService({
    post: {
      id: 'post-1',
      status: 'PUBLISHED',
      title: 'Published article',
      body: 'Body',
      tags: [],
      pinnedAt: null,
      publishedAt: new Date('2026-07-25T00:00:00.000Z'),
      withdrawnAt: null,
      authorId: manager.sub,
      createdAt: new Date('2026-07-25T00:00:00.000Z'),
      updatedAt: new Date('2026-07-25T00:00:00.000Z'),
      author: { id: manager.sub, email: manager.email, displayName: 'Manager' },
      attachments: [],
    },
  });

  await service.getPublishedPost(
    { ...manager, sub: 'reader-1', role: 'MEMBER' } as never,
    'post-1',
  );

  assert.deepEqual(readUpserts, []);
});

test('published inline images receive a view URL rather than a forced download URL', async () => {
  const { service, viewUrlCalls, downloadUrlCalls } = createService({
    attachment: {
      id: 'image-1',
      status: 'READY',
      storageKey: 'subscriptions/post-1/image-1.png',
      originalName: 'image-1.png',
      mimeType: 'image/png',
      size: 1024n,
      post: { status: 'PUBLISHED' },
    },
  });

  const result = await service.getAttachmentViewUrl(
    { ...manager, sub: 'reader-1', role: 'MEMBER' } as never,
    'image-1',
  );

  assert.equal(result.url, 'https://objects.example/view/image.png');
  assert.deepEqual(viewUrlCalls, [
    { storageKey: 'subscriptions/post-1/image-1.png', mimeType: 'image/png' },
  ]);
  assert.deepEqual(downloadUrlCalls, []);
});

test('subscription managers can preview ready inline images while the post is still a draft', async () => {
  const { service } = createService({
    attachment: {
      id: 'image-1',
      status: 'READY',
      storageKey: 'subscriptions/post-1/image-1.png',
      originalName: 'image-1.png',
      mimeType: 'image/png',
      size: 1024n,
      post: { status: 'DRAFT' },
    },
  });

  const result = await service.getAttachmentViewUrl(manager as never, 'image-1');

  assert.equal(result.url, 'https://objects.example/view/image.png');
});

test('ordinary members cannot preview images from article drafts', async () => {
  const { service } = createService({
    attachment: {
      id: 'image-1',
      status: 'READY',
      storageKey: 'subscriptions/post-1/image-1.png',
      originalName: 'image-1.png',
      mimeType: 'image/png',
      size: 1024n,
      post: { status: 'DRAFT' },
    },
  });

  await assert.rejects(
    () => service.getAttachmentViewUrl(
      { ...manager, sub: 'reader-1', role: 'MEMBER' } as never,
      'image-1',
    ),
    NotFoundException,
  );
});

test('legacy markUnread removes only the legacy read row and leaves confirmation untouched', async () => {
  const { service, readDeletions } = createService({
    post: {
      id: 'post-1',
      status: 'PUBLISHED',
    },
  });

  await service.markUnread('reader-1', 'post-1');

  assert.deepEqual(readDeletions, [{ postId: 'post-1', userId: 'reader-1' }]);
});
