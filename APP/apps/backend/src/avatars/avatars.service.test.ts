import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AvatarsService } from './avatars.service';

function createService(uploadedKeys: string[] = []) {
  const categoryUpdates: Array<{ name: string; avatarStorageKey: string | null }> = [];
  const deletedKeys: string[] = [];
  let serverLookup: {
    id: string;
    name: string;
    avatarStorageKey: string | null;
  } | null = {
    id: 'server-1',
    name: '研发',
    avatarStorageKey: 'avatars/servers/server-1/old.png',
  };
  const prismaService = {
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(prismaService),
    user: {
      update: async () => undefined,
    },
    server: {
      update: async () => undefined,
    },
    category: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { name: string };
        create: { name: string; avatarStorageKey: string | null };
        update: { avatarStorageKey: string | null };
      }) => {
        const avatarStorageKey = update.avatarStorageKey ?? create.avatarStorageKey;
        categoryUpdates.push({ name: where.name, avatarStorageKey });
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { name: string };
        data: { avatarStorageKey: string | null };
      }) => {
        categoryUpdates.push({ name: where.name, avatarStorageKey: data.avatarStorageKey });
      },
    },
  };
  const filesService = {
    uploadBufferToS3: async (storageKey: string) => {
      uploadedKeys.push(storageKey);
    },
    deleteS3Object: async (storageKey: string) => {
      deletedKeys.push(storageKey);
      return true;
    },
  };
  const configService = {
    getOrThrow: () => 'http://api.example.test',
  };
  const permissionService = {
    assertPermission: async () => undefined,
  };
  const serversService = {
    ensureServerByName: async () => serverLookup,
    findByName: async () => serverLookup,
    requireServer: async () => serverLookup,
    buildAvatarUrl: (serverId: string, storageKey?: string | null) =>
      storageKey
        ? `http://api.example.test/api/avatars/servers/by-id/${serverId}/content?v=${encodeURIComponent(storageKey)}`
        : null,
  };

  const service = new AvatarsService(
    prismaService as any,
    filesService as any,
    configService as any,
    permissionService as any,
    serversService as any,
  );

  return {
    service,
    categoryUpdates,
    deletedKeys,
    setServerLookup(value: typeof serverLookup) {
      serverLookup = value;
    },
  };
}

test('buildUserAvatarUrl includes the storage key version so clients refetch replaced avatars', () => {
  const { service } = createService();

  assert.equal(
    service.buildUserAvatarUrl('user-1', 'avatars/users/user-1/avatar-a.png'),
    'http://api.example.test/api/avatars/users/user-1/content?v=avatars%2Fusers%2Fuser-1%2Favatar-a.png',
  );
});

test('uploadUserAvatar stores each replacement under a new key', async () => {
  const uploadedKeys: string[] = [];
  const { service } = createService(uploadedKeys);
  const file = {
    buffer: Buffer.from('avatar'),
    mimetype: 'image/png',
    size: 6,
  };

  await service.uploadUserAvatar('user-1', file as any);
  await service.uploadUserAvatar('user-1', file as any);

  assert.equal(uploadedKeys.length, 2);
  assert.notEqual(uploadedKeys[0], uploadedKeys[1]);
});

test('buildServerAvatarUrl includes the storage key version so clients refetch replaced avatars', () => {
  const { service } = createService();

  assert.equal(
    service.buildServerAvatarUrl('server-1', 'avatars/servers/server-1/avatar-a.png'),
    'http://api.example.test/api/avatars/servers/by-id/server-1/content?v=avatars%2Fservers%2Fserver-1%2Favatar-a.png',
  );
});

test('uploadServerAvatar stores each replacement under a new key', async () => {
  const uploadedKeys: string[] = [];
  const { service, deletedKeys } = createService(uploadedKeys);
  const actor = { sub: 'user-1', email: 'admin@example.com', role: 'ADMIN' };
  const file = {
    buffer: Buffer.from('avatar'),
    mimetype: 'image/png',
    size: 6,
  };

  await service.uploadServerAvatar(actor as any, '研发', file as any);
  await service.uploadServerAvatar(actor as any, '研发', file as any);

  assert.equal(uploadedKeys.length, 2);
  assert.notEqual(uploadedKeys[0], uploadedKeys[1]);
  assert.deepEqual(deletedKeys, [
    'avatars/servers/server-1/old.png',
    'avatars/servers/server-1/old.png',
  ]);
});

test('deleteServerAvatar clears category avatar after permission check', async () => {
  const { service, categoryUpdates, deletedKeys } = createService();
  const actor = { sub: 'user-1', email: 'admin@example.com', role: 'ADMIN' };

  await service.deleteServerAvatar(actor as any, '研发');

  assert.deepEqual(categoryUpdates, [{ name: '研发', avatarStorageKey: null }]);
  assert.deepEqual(deletedKeys, ['avatars/servers/server-1/old.png']);
});

test('deleteServerAvatar does not create an empty category when one does not exist', async () => {
  const { service, categoryUpdates, deletedKeys, setServerLookup } = createService();
  const actor = { sub: 'user-1', email: 'admin@example.com', role: 'ADMIN' };
  setServerLookup(null);

  await service.deleteServerAvatar(actor as any, '研发');

  assert.deepEqual(categoryUpdates, []);
  assert.deepEqual(deletedKeys, []);
});
