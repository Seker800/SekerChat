import assert from 'node:assert/strict';
import test from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { AlbumService } from './album.service';

const actor = { sub: 'user-1', email: 'user@example.com', role: 'MEMBER' };
const manager = { ...actor, sub: 'admin-1', role: 'ADMIN' };

function createService(canManage = true) {
  const findManyCalls: unknown[] = [];
  const updateCalls: unknown[] = [];
  const photos = [
    { id: 'p3', width: 300, height: 400, createdAt: new Date('2026-08-13T03:00:00Z') },
    { id: 'p2', width: 400, height: 300, createdAt: new Date('2026-08-13T02:00:00Z') },
    { id: 'p1', width: 100, height: 100, createdAt: new Date('2026-08-13T01:00:00Z') },
  ].map((photo) => ({
    ...photo,
    storageKey: `album/originals/${photo.id}`,
    thumbnailStorageKey: `album/thumbnails/${photo.id}.jpg`,
    mimeType: 'image/jpeg',
  }));
  const prisma = {
    albumPhoto: {
      findMany: async (args: unknown) => {
        findManyCalls.push(args);
        const ids = (args as { where?: { id?: { in?: string[] } } }).where?.id?.in;
        return ids ? photos.filter((photo) => ids.includes(photo.id)) : photos;
      },
      findFirst: async () => ({
        ...photos[0],
        storageKey: 'album/p3',
        thumbnailStorageKey: 'album/thumb-p3',
        mimeType: 'image/webp',
        size: 10n,
        originalName: 'private.webp',
        uploaderId: 'user-1',
        deletedAt: null,
        tags: [],
      }),
      updateMany: async (args: unknown) => {
        updateCalls.push(args);
        const ids = (args as { where?: { id?: { in?: string[] } } }).where?.id?.in;
        return { count: ids?.length ?? 1 };
      },
      update: async () => ({}),
    },
    albumPhotoTag: {
      findMany: async () => [],
      groupBy: async () => [],
      deleteMany: async () => ({}),
      createMany: async () => ({}),
    },
    albumMediaJob: {
      upsert: async () => ({}),
      createMany: async () => ({}),
    },
    albumTag: { findMany: async () => [] },
    $transaction: async (callback: (tx: unknown) => unknown) => callback(prisma),
  };
  const service = new AlbumService(
    prisma as never,
    {
      hasPermission: async () => canManage,
      assertPermission: async () => {
        if (!canManage) throw new ForbiddenException();
      },
    } as never,
    {
      contentUrl: (id: string) => `/api/album/photos/${id}/content`,
      thumbnailUrl: (id: string) => `/api/album/photos/${id}/thumbnail`,
      signedThumbnailUrl: (id: string) => `/api/album/photos/${id}/thumbnail?mediaTicket=test`,
      getStream: async () => ({}),
      createViewUrl: async () => 'https://objects.example/photo',
    } as never,
  );
  return { service, findManyCalls, updateCalls };
}

function createUpdateStatusService(options: {
  currentRevision: bigint;
  seenRevision: bigint | null;
  unseenUploaderId?: string | null;
  accountBaselineRevision?: bigint | null;
}) {
  const readStateUpserts: unknown[] = [];
  const prisma = {
    albumState: {
      findUnique: async () => ({ revision: options.currentRevision }),
    },
    albumReadState: {
      findUnique: async () =>
        options.seenRevision === null ? null : { seenRevision: options.seenRevision },
      upsert: async (args: unknown) => readStateUpserts.push(args),
    },
    albumPhoto: {
      findFirst: async (args: { where: { uploaderId?: { not: string } } }) => {
        if (!args.where.uploaderId) {
          return options.accountBaselineRevision === undefined
            ? { revision: options.currentRevision }
            : options.accountBaselineRevision === null
              ? null
              : { revision: options.accountBaselineRevision };
        }
        return options.unseenUploaderId &&
          options.unseenUploaderId !== args.where.uploaderId.not
          ? { id: 'unseen-photo' }
          : null;
      },
    },
    user: {
      findUniqueOrThrow: async () => ({ createdAt: new Date('2026-08-13T00:00:00Z') }),
    },
    $transaction: async (callback: (tx: unknown) => unknown) => callback(prisma),
    $executeRaw: async () => 1,
  };
  return {
    service: new AlbumService(prisma as never, {} as never, {} as never),
    readStateUpserts,
  };
}

test('album update status initializes users at the current revision without historical reminders', async () => {
  const { service, readStateUpserts } = createUpdateStatusService({
    currentRevision: 12n,
    seenRevision: null,
  });

  assert.deepEqual(await service.getUpdateStatus(actor), { hasUpdates: false });
  assert.deepEqual(readStateUpserts, [
    {
      where: { userId: actor.sub },
      create: { userId: actor.sub, seenRevision: 12n },
      update: {},
    },
  ]);
});

test('a new account still sees uploads completed after the account was created', async () => {
  const { service, readStateUpserts } = createUpdateStatusService({
    currentRevision: 14n,
    seenRevision: null,
    accountBaselineRevision: 12n,
    unseenUploaderId: 'user-2',
  });

  assert.deepEqual(await service.getUpdateStatus(actor), { hasUpdates: true });
  assert.equal(
    (readStateUpserts[0] as { create: { seenRevision: bigint } }).create.seenRevision,
    12n,
  );
});

test('album update status ignores own uploads and reports another user\'s active photo', async () => {
  const ownUpload = createUpdateStatusService({
    currentRevision: 8n,
    seenRevision: 7n,
    unseenUploaderId: actor.sub,
  });
  assert.deepEqual(await ownUpload.service.getUpdateStatus(actor), { hasUpdates: false });

  const otherUpload = createUpdateStatusService({
    currentRevision: 9n,
    seenRevision: 7n,
    unseenUploaderId: 'user-2',
  });
  assert.deepEqual(await otherUpload.service.getUpdateStatus(actor), { hasUpdates: true });
});

test('markViewed atomically advances the user read position', async () => {
  const { service } = createUpdateStatusService({ currentRevision: 9n, seenRevision: 7n });
  assert.deepEqual(await service.markViewed(actor), { hasUpdates: false });
});

test('listPhotos returns a stable limited page without private metadata', async () => {
  const { service, findManyCalls } = createService();
  const page = await service.listPhotos({ limit: 2, tag: ' 团建 ' });
  assert.equal(page.items.length, 2);
  assert.ok(page.nextCursor);
  assert.deepEqual(Object.keys(page.items[0]).sort(), [
    'contentUrl',
    'createdAt',
    'durationMs',
    'height',
    'id',
    'mediaType',
    'mimeType',
    'thumbnailUrl',
    'width',
  ]);
  const query = findManyCalls[0] as { where: { deletedAt: null; tags: unknown }; take: number };
  assert.equal(query.take, 3);
  assert.equal(query.where.deletedAt, null);
  assert.ok(query.where.tags);
});

test('listPhotos leaves a video thumbnail empty until its JPEG poster is ready', async () => {
  const { service } = createService();
  const video = service.serializePhoto({
    id: 'video-1',
    width: 1920,
    height: 1080,
    createdAt: new Date('2026-08-13T04:00:00Z'),
    storageKey: 'album/originals/video-1',
    thumbnailStorageKey: null,
    mimeType: 'video/mp4',
    durationMs: 12_000,
  });
  assert.equal(video.thumbnailUrl, null);
});

test('softDelete requires manage_album and is idempotent', async () => {
  await assert.rejects(
    () => createService(false).service.softDelete(actor, 'p3'),
    ForbiddenException,
  );
  const { service, updateCalls } = createService(true);
  assert.deepEqual(await service.softDelete(manager, 'p3'), { photoId: 'p3', deleted: true });
  assert.equal(updateCalls.length, 1);
});

test('softDelete schedules durable object cleanup inside the same transaction', async () => {
  const createdJobs: any[] = [];
  const prisma = {
    albumPhoto: { updateMany: async () => ({ count: 1 }) },
    albumPhotoTag: { groupBy: async () => [] },
    albumMediaJob: { upsert: async (args: unknown) => createdJobs.push(args) },
    $transaction: async (callback: (tx: any) => unknown) => callback(prisma),
  };
  const service = new AlbumService(
    prisma as never,
    { assertPermission: async () => undefined } as never,
    {} as never,
  );

  assert.deepEqual(await service.softDelete(manager, 'photo-1'), {
    photoId: 'photo-1',
    deleted: true,
  });
  assert.equal(createdJobs.length, 1);
  assert.equal(createdJobs[0].create.kind, 'PURGE_PHOTO');
  assert.ok(createdJobs[0].create.availableAt instanceof Date);
  assert.ok(createdJobs[0].create.availableAt.getTime() > Date.now() + 6 * 24 * 60 * 60 * 1000);
});

test('softDeleteMany requires manage_album and deletes unique photos atomically', async () => {
  await assert.rejects(
    () => createService(false).service.softDeleteMany(actor, ['p3', 'p2']),
    ForbiddenException,
  );
  const { service, updateCalls } = createService(true);
  assert.deepEqual(await service.softDeleteMany(manager, ['p3', 'p2', 'p3']), {
    requestedCount: 2,
    deletedCount: 2,
  });
  assert.deepEqual((updateCalls[0] as { where: { id: { in: string[] }; deletedAt: null } }).where, {
    id: { in: ['p3', 'p2'] },
    deletedAt: null,
  });
});

test('getManagePhoto exposes tags only to album managers', async () => {
  await assert.rejects(
    () => createService(false).service.getManagePhoto(actor, 'p3'),
    ForbiddenException,
  );
  const { service } = createService(true);
  const photo = await service.getManagePhoto(manager, 'p3');
  assert.deepEqual(photo, { photoId: 'p3', tags: [] });
  assert.equal('storageKey' in photo, false);
  assert.equal('originalName' in photo, false);
});

test('getThumbnail uses a valid media ticket without reading photo metadata', async () => {
  let photoLookupCount = 0;
  const service = new AlbumService(
    {
      albumPhoto: {
        findFirst: async () => {
          photoLookupCount += 1;
          throw new Error('photo lookup should not run');
        },
      },
    } as never,
    {} as never,
    {
      getStreamFromTicket: async () => ({
        media: {
          key: 'album/thumbnails/photo-1.jpg',
          mimeType: 'image/jpeg',
          expiresAt: 1,
          v: 1,
        },
        stream: {},
        contentLength: 100,
      }),
    } as never,
  );

  const result = await service.getThumbnail('photo-1', undefined, 'ticket');
  assert.equal(photoLookupCount, 0);
  assert.equal('contentLength' in result ? result.contentLength : undefined, 100);
});
