import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageType } from '@prisma/client';
import { RetentionService } from './retention.service';

test('purgeOrphanedFiles only removes db records after backing objects are deleted', async () => {
  const deletedKeys = new Set<string>();
  const deletedFileIds: string[] = [];

  const prismaService = {
    $queryRaw: async () => [
      {
        id: 'file-1',
        storageKey: 'group-1/file-1.png',
        thumbnailStorageKey: 'group-1/thumb/file-1.png.jpg',
      },
      {
        id: 'file-2',
        storageKey: 'group-1/file-2.png',
        thumbnailStorageKey: null,
      },
    ],
    fileObject: {
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedFileIds.push(...where.id.in);
        return { count: where.id.in.length };
      },
    },
    message: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
  };

  const filesService = {
    deleteS3Object: async (storageKey: string) => {
      deletedKeys.add(storageKey);
      return storageKey !== 'group-1/file-2.png';
    },
  };

  const retentionConfigService = {
    getPolicy: async () => ({
      textRetentionDays: '0',
      imageRetentionDays: '0',
      imageRetentionSizeGB: '0',
      fileRetentionDays: '0',
      fileRetentionSizeGB: '0',
    }),
  };

  const service = new RetentionService(
    prismaService as never,
    retentionConfigService as never,
    filesService as never,
  );

  await service.enforceRetention();

  assert.deepEqual([...deletedKeys].sort(), [
    'group-1/file-1.png',
    'group-1/file-2.png',
    'group-1/thumb/file-1.png.jpg',
  ]);
  assert.deepEqual(deletedFileIds, ['file-1']);
});

test('purgeOrphanedFiles ignores uploads that were never attached to a message', async () => {
  const deletedKeys = new Set<string>();
  const deletedFileIds: string[] = [];

  const prismaService = {
    $queryRaw: async () => [],
    fileObject: {
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        deletedFileIds.push(...where.id.in);
        return { count: where.id.in.length };
      },
    },
    message: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
      updateMany: async () => ({ count: 0 }),
    },
  };

  const filesService = {
    deleteS3Object: async (storageKey: string) => {
      deletedKeys.add(storageKey);
      return true;
    },
  };

  const retentionConfigService = {
    getPolicy: async () => ({
      textRetentionDays: '0',
      imageRetentionDays: '0',
      imageRetentionSizeGB: '0',
      fileRetentionDays: '0',
      fileRetentionSizeGB: '0',
    }),
  };

  const service = new RetentionService(
    prismaService as never,
    retentionConfigService as never,
    filesService as never,
  );

  await service.enforceRetention();

  assert.deepEqual([...deletedKeys], []);
  assert.deepEqual(deletedFileIds, []);
});

test('normalized retention policy applies to text and attachment categories', async () => {
  const deletedTypes: MessageType[] = [];
  const detachedPayloads: Array<{ id: { in: string[] } }> = [];

  const prismaService: Record<string, any> = {
    $queryRaw: async () => [{ total: 0n }],
    fileObject: {
      deleteMany: async () => ({ count: 0 }),
    },
    fileShare: {
      deleteMany: async () => ({ count: 0 }),
    },
    message: {
      deleteMany: async ({ where }: { where: { type: MessageType } }) => {
        deletedTypes.push(where.type);
        return { count: 1 };
      },
      findMany: async ({ where }: { where: { type: MessageType } }) => {
        if (where.type === MessageType.IMAGE) {
          return [{ id: 'image-message-1' }];
        }
        if (where.type === MessageType.FILE) {
          return [{ id: 'file-message-1' }];
        }
        return [];
      },
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        detachedPayloads.push(where);
        return { count: where.id.in.length };
      },
    },
  };
  prismaService.$transaction = async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback(prismaService);

  const retentionConfigService = {
    getPolicy: async () => ({
      textRetentionDays: 7,
      imageRetentionDays: 7,
      imageRetentionSizeGB: 0,
      fileRetentionDays: 7,
      fileRetentionSizeGB: 0,
    }),
  };

  const filesService = {
    deleteS3Object: async () => true,
  };

  const service = new RetentionService(
    prismaService as never,
    retentionConfigService as never,
    filesService as never,
  );

  await service.enforceRetention();

  assert.deepEqual(deletedTypes, [MessageType.TEXT]);
  assert.deepEqual(detachedPayloads, [
    { id: { in: ['image-message-1'] } },
    { id: { in: ['file-message-1'] } },
  ]);
});

test('day-based attachment retention still detaches revoked attachment messages', async () => {
  const findManyCalls: Array<{ type: MessageType }> = [];
  const detachedPayloads: Array<{ id: { in: string[] } }> = [];

  const prismaService: Record<string, any> = {
    $queryRaw: async () => [],
    fileObject: {
      deleteMany: async () => ({ count: 0 }),
    },
    fileShare: {
      deleteMany: async () => ({ count: 0 }),
    },
    message: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async ({ where }: { where: { type: MessageType } }) => {
        findManyCalls.push({ type: where.type });
        if (where.type === MessageType.IMAGE) {
          return [{ id: 'revoked-image-message' }];
        }
        return [];
      },
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        detachedPayloads.push(where);
        return { count: where.id.in.length };
      },
    },
  };
  prismaService.$transaction = async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback(prismaService);

  const retentionConfigService = {
    getPolicy: async () => ({
      imageRetentionDays: '30',
      fileRetentionDays: '0',
      textRetentionDays: '0',
      imageRetentionSizeGB: '0',
      fileRetentionSizeGB: '0',
    }),
  };

  const filesService = {
    deleteS3Object: async () => true,
  };

  const service = new RetentionService(
    prismaService as never,
    retentionConfigService as never,
    filesService as never,
  );

  await service.enforceRetention();

  assert.deepEqual(findManyCalls, [{ type: MessageType.IMAGE }]);
  assert.deepEqual(detachedPayloads, [{ id: { in: ['revoked-image-message'] } }]);
});

test('attachment retention removes the public share when the last chat attachment is detached', async () => {
  const deletedShareFilters: unknown[] = [];
  const prismaService: Record<string, any> = {
    $queryRaw: async () => [],
    fileObject: {
      deleteMany: async () => ({ count: 0 }),
    },
    fileShare: {
      deleteMany: async ({ where }: { where: unknown }) => {
        deletedShareFilters.push(where);
        return { count: 1 };
      },
    },
    message: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async ({ where }: { where: { type: MessageType } }) =>
        where.type === MessageType.FILE
          ? [{ id: 'expired-file-message', attachmentFileId: 'file-1' }]
          : [],
      updateMany: async () => ({ count: 1 }),
    },
  };
  prismaService.$transaction = async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback(prismaService);

  const retentionConfigService = {
    getPolicy: async () => ({
      imageRetentionDays: 0,
      fileRetentionDays: 30,
      textRetentionDays: 0,
      imageRetentionSizeGB: 0,
      fileRetentionSizeGB: 0,
    }),
  };

  const service = new RetentionService(
    prismaService as never,
    retentionConfigService as never,
    { deleteS3Object: async () => true } as never,
  );

  await service.enforceRetention();

  assert.deepEqual(deletedShareFilters, [
    {
      fileId: { in: ['file-1'] },
      file: { messages: { none: {} } },
    },
  ]);
});

test('size-based attachment retention counts shared file objects once and detaches all referencing messages together', async () => {
  let queryIndex = 0;
  const detachedPayloads: Array<{ id: { in: string[] } }> = [];
  const findManyCalls: Array<{ type: MessageType; attachmentFileId?: { in: string[] } }> = [];

  const prismaService: Record<string, any> = {
    $queryRaw: async () => {
      queryIndex += 1;
      if (queryIndex === 1) {
        return [{ total: 11n * 1024n * 1024n * 1024n }];
      }
      if (queryIndex === 2) {
        return [
          { file_id: 'shared-file', file_bytes: 6n * 1024n * 1024n * 1024n },
          { file_id: 'single-file', file_bytes: 5n * 1024n * 1024n * 1024n },
        ];
      }
      return [];
    },
    fileObject: {
      deleteMany: async () => ({ count: 0 }),
    },
    fileShare: {
      deleteMany: async () => ({ count: 0 }),
    },
    message: {
      deleteMany: async () => ({ count: 0 }),
      findMany: async ({
        where,
      }: {
        where: { type: MessageType; attachmentFileId?: { in: string[] } };
      }) => {
        findManyCalls.push(where);
        if (where.attachmentFileId) {
          return [{ id: 'message-a' }, { id: 'message-b' }, { id: 'message-c' }];
        }
        return [];
      },
      updateMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        detachedPayloads.push(where);
        return { count: where.id.in.length };
      },
    },
  };
  prismaService.$transaction = async (callback: (transaction: unknown) => Promise<unknown>) =>
    callback(prismaService);

  const retentionConfigService = {
    getPolicy: async () => ({
      imageRetentionSizeGB: '0',
      fileRetentionSizeGB: '10',
      textRetentionDays: '0',
      imageRetentionDays: '0',
      fileRetentionDays: '0',
    }),
  };

  const filesService = {
    deleteS3Object: async () => true,
  };

  const service = new RetentionService(
    prismaService as never,
    retentionConfigService as never,
    filesService as never,
  );

  await service.enforceRetention();

  assert.deepEqual(findManyCalls, [
    {
      type: MessageType.FILE,
      attachmentFileId: { in: ['shared-file'] },
    },
  ]);
  assert.deepEqual(detachedPayloads, [{ id: { in: ['message-a', 'message-b', 'message-c'] } }]);
});
