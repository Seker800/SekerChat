import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';
import { AlbumStorageService } from './album-storage.service';

function createStorage(photo: Record<string, unknown> | null, deleteResults: boolean[] = []) {
  const deletedKeys: string[] = [];
  const deletedRows: string[] = [];
  const service = new AlbumStorageService(
    { getOrThrow: () => 'http://backend.test' } as never,
    {} as never,
    {
      delete: async (key: string) => {
        deletedKeys.push(key);
        return deleteResults.shift() ?? true;
      },
    } as never,
    {
      albumPhoto: {
        findUnique: async () => photo,
        delete: async ({ where }: any) => deletedRows.push(where.id),
      },
    } as never,
    { issue: () => 'ticket', verify: () => null } as never,
    {} as never,
  );
  return { service, deletedKeys, deletedRows };
}

test('computeSha256 hashes the stored object as a stream', async () => {
  const service = new AlbumStorageService(
    { getOrThrow: () => 'http://backend.test' } as never,
    {} as never,
    {
      get: async () => ({ stream: Readable.from([Buffer.from('album-'), Buffer.from('photo')]) }),
    } as never,
    {} as never,
    { issue: () => 'ticket', verify: () => null } as never,
    {} as never,
  );

  assert.equal(
    await service.computeSha256('album/originals/photo-1'),
    createHash('sha256').update('album-photo').digest('hex'),
  );
});

test('hashPhotoContent backfills a missing hash without overwriting a concurrent result', async () => {
  const updates: Array<Record<string, unknown>> = [];
  const service = new AlbumStorageService(
    { getOrThrow: () => 'http://backend.test' } as never,
    {} as never,
    {
      get: async () => ({ stream: Readable.from([Buffer.from('album-photo')]) }),
    } as never,
    {
      albumPhoto: {
        findUnique: async () => ({
          id: 'photo-1',
          storageKey: 'album/originals/photo-1',
          sha256: null,
        }),
        updateMany: async ({ where, data }: { where: unknown; data: Record<string, unknown> }) => {
          updates.push({ where, data });
        },
      },
    } as never,
    { issue: () => 'ticket', verify: () => null } as never,
    {} as never,
  );

  await service.hashPhotoContent('photo-1');

  assert.deepEqual(updates[0]?.where, { id: 'photo-1', sha256: null });
  assert.equal(
    (updates[0]?.data as { sha256?: string }).sha256,
    createHash('sha256').update('album-photo').digest('hex'),
  );
});

test('purgeDeletedPhoto deletes both objects before removing the database row', async () => {
  const { service, deletedKeys, deletedRows } = createStorage({
    id: 'photo-1',
    storageKey: 'album/originals/photo-1',
    thumbnailStorageKey: 'album/thumbnails/photo-1.jpg',
    deletedAt: new Date(),
  });

  await service.purgeDeletedPhoto('photo-1');

  assert.deepEqual(deletedKeys, ['album/originals/photo-1', 'album/thumbnails/photo-1.jpg']);
  assert.deepEqual(deletedRows, ['photo-1']);
});

test('purgeDeletedPhoto preserves the row when object deletion fails', async () => {
  const { service, deletedRows } = createStorage(
    {
      id: 'photo-1',
      storageKey: 'album/originals/photo-1',
      thumbnailStorageKey: null,
      deletedAt: new Date(),
    },
    [false],
  );

  await assert.rejects(() => service.purgeDeletedPhoto('photo-1'), /原图删除失败/);
  assert.deepEqual(deletedRows, []);
});

test('purgeDeletedPhoto refuses active photos', async () => {
  const { service, deletedKeys } = createStorage({
    id: 'photo-1',
    storageKey: 'album/originals/photo-1',
    thumbnailStorageKey: null,
    deletedAt: null,
  });

  await assert.rejects(() => service.purgeDeletedPhoto('photo-1'), /仍在使用/);
  assert.deepEqual(deletedKeys, []);
});
