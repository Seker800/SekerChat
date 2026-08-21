import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { UploadCleanupService } from './upload-cleanup.service';

test('stale subscription upload cleanup paginates by id after cascade deletion', async () => {
  const queryCursors: Array<string | undefined> = [];
  const firstBatch = Array.from({ length: 100 }, (_, index) => ({
    id: `upload-${String(index).padStart(3, '0')}`,
    objectKey: `subscriptions/post-1/${index}/file.zip`,
    multipartUploadId: `multipart-${index}`,
    subscriptionAttachmentId: `attachment-${index}`,
  }));
  const prisma = {
    uploadSession: {
      findMany: async ({ where }: { where: { id?: { gt: string } } }) => {
        queryCursors.push(where.id?.gt);
        if (!where.id?.gt) return firstBatch;
        if (where.id.gt === 'upload-099') {
          return [
            {
              id: 'upload-100',
              objectKey: 'subscriptions/post-1/100/file.zip',
              multipartUploadId: 'multipart-100',
              subscriptionAttachmentId: 'attachment-100',
            },
          ];
        }
        return [];
      },
      updateMany: async () => ({ count: 1 }),
    },
    subscriptionAttachment: {
      delete: async () => ({ id: 'attachment' }),
    },
  };
  const files = {
    abortMultipartUpload: async () => undefined,
  };

  const service = new UploadCleanupService(prisma as never, files as never);
  await service.cleanupExpiredInitiatedUploads();

  assert.deepEqual(queryCursors, [undefined, 'upload-099', 'upload-100']);
});

test('stale cleanup delegates an atomic target-specific expiration transition', async () => {
  const expired: unknown[] = [];
  let queryCount = 0;
  const staleSession = {
    id: 'custom-upload-1',
    objectKey: 'custom/owner-1/upload.bin',
    multipartUploadId: 'multipart-1',
    subscriptionAttachmentId: null,
    kind: 'CUSTOM_ASSET',
    uploaderId: 'owner-1',
  };
  const prisma = {
    uploadSession: {
      findMany: async () => (++queryCount === 1 ? [staleSession] : []),
    },
  };
  const service = new UploadCleanupService(
    prisma as never,
    { abortMultipartUpload: async () => undefined } as never,
    {
      get: () => ({
        expireInitiatedSession: async (session: unknown, expiredAt: Date) => {
          expired.push({ session, expiredAt });
          return true;
        },
      }),
    } as never,
  );

  await service.cleanupExpiredInitiatedUploads();

  assert.equal(expired.length, 1);
  assert.equal((expired[0] as { session: unknown }).session, staleSession);
  assert.ok((expired[0] as { expiredAt: Date }).expiredAt instanceof Date);
});

test('failed upload cleanup deletes only old objects without database references', async () => {
  const deletedObjectKeys: string[] = [];
  const abortedSessionIds: string[] = [];
  let uploadSessionQueryCount = 0;
  const prisma = {
    uploadSession: {
      findMany: async () => {
        uploadSessionQueryCount += 1;
        return uploadSessionQueryCount === 1
          ? [
              {
                id: 'referenced-upload',
                objectKey: 'group-1/direct/referenced.bin',
                subscriptionAttachmentId: null,
              },
              {
                id: 'orphan-upload',
                objectKey: 'group-1/direct/orphan.bin',
                subscriptionAttachmentId: null,
              },
            ]
          : [];
      },
      updateMany: async ({ where }: { where: { id: string } }) => {
        abortedSessionIds.push(where.id);
        return { count: 1 };
      },
    },
    fileObject: {
      findFirst: async ({ where }: { where: { storageKey: string } }) =>
        where.storageKey.includes('referenced') ? { id: 'file-1' } : null,
    },
    groupArtifact: {
      findFirst: async () => null,
    },
    subscriptionAttachment: {
      findFirst: async () => null,
      deleteMany: async () => ({ count: 0 }),
    },
  };
  const service = new UploadCleanupService(
    prisma as never,
    {
      deleteS3Object: async (objectKey: string) => {
        deletedObjectKeys.push(objectKey);
      },
    } as never,
  );

  await service.cleanupExpiredUnreferencedObjects();

  assert.deepEqual(deletedObjectKeys, ['group-1/direct/orphan.bin']);
  assert.deepEqual(abortedSessionIds, ['orphan-upload']);
});

test('duplicate cleanup removes an orphan even after the referenced album photo was purged', async () => {
  const deletedObjectKeys: string[] = [];
  const clearedSessions: string[] = [];
  let queryCount = 0;
  const prisma = {
    uploadSession: {
      findMany: async () => {
        queryCount += 1;
        return queryCount === 1
          ? []
          : [
              {
                id: 'duplicate-upload',
                objectKey: 'album/originals/duplicate-object',
                albumPhoto: null,
              },
            ];
      },
      update: async ({ where }: { where: { id: string } }) => {
        clearedSessions.push(where.id);
      },
    },
    fileObject: { findFirst: async () => null },
    groupArtifact: { findFirst: async () => null },
    subscriptionAttachment: { findFirst: async () => null },
    albumPhoto: { findFirst: async () => null },
  };
  const service = new UploadCleanupService(
    prisma as never,
    {
      deleteS3Object: async (objectKey: string) => {
        deletedObjectKeys.push(objectKey);
        return true;
      },
    } as never,
  );

  await service.cleanupExpiredUnreferencedObjects();

  assert.deepEqual(deletedObjectKeys, ['album/originals/duplicate-object']);
  assert.deepEqual(clearedSessions, ['duplicate-upload']);
});
