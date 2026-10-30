import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

function fixture(status = 'PUBLISHED') {
  const views: Array<{ postId: string; userId: string; firstViewedAt: Date }> = [];
  const events: unknown[] = [];
  const user = {
    displayName: 'Reader',
    email: 'reader@example.test',
    avatarStorageKey: 'avatar-version',
  };
  const prisma: any = {
    $transaction: async (fn: any) => fn(prisma),
    $queryRaw: async () => (status === 'MISSING' ? [] : [{ id: 'post', status }]),
    subscriptionPostView: {
      createMany: async ({ data }: any) => {
        const row = data[0];
        if (views.some((v) => v.postId === row.postId && v.userId === row.userId))
          return { count: 0 };
        views.push({ ...row, firstViewedAt: new Date() });
        return { count: 1 };
      },
      findMany: async () => views.map((v) => ({ ...v, user })),
    },
  };
  const service = new SubscriptionsService(
    prisma,
    {} as never,
    {
      enqueue: async (_tx: any, event: any) => {
        events.push(event);
      },
    } as never,
    {} as never,
    undefined,
    { buildUserAvatarUrl: () => '/api/avatar' } as never,
  );
  return { service, views, events };
}
test('opening a published article records each person once and keeps the original date', async () => {
  const { service, views, events } = fixture();
  const first = await service.recordView('reader', 'post');
  const original = views[0]!.firstViewedAt;
  const again = await service.recordView('reader', 'post');
  assert.equal(first.viewCount, 1);
  assert.equal(again.viewCount, 1);
  assert.equal(again.viewers[0]!.firstViewedAt, original);
  assert.equal(again.viewers[0]!.avatarUrl, '/api/avatar');
  assert.equal(again.viewers[0]!.displayName, 'Reader');
  assert.equal(events.length, 1);
});
test('new readers are accepted without an old publication recipient assignment', async () => {
  const { service } = fixture();
  await service.recordView('reader', 'post');
  const result = await service.recordView('new-user', 'post');
  assert.equal(result.viewCount, 2);
  assert.equal(result.viewers.length, 2);
});
for (const status of ['DRAFT', 'WITHDRAWN', 'MISSING'])
  test(`does not record views for ${status} articles`, async () => {
    const { service, views } = fixture(status);
    await assert.rejects(
      () => service.recordView('reader', 'post'),
      status === 'MISSING' ? NotFoundException : ConflictException,
    );
    assert.equal(views.length, 0);
  });
