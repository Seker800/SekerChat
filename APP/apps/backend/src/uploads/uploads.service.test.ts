import { strict as assert } from 'node:assert';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { UploadKind } from '@prisma/client';
import { ObjectSizeMismatchError } from '../files/object-size-mismatch.error';
import { UploadsService } from './uploads.service';

function createUploadSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'upload-1',
    kind: UploadKind.CHAT_ATTACHMENT,
    status: 'INITIATED',
    originalName: 'demo.bin',
    mimeType: 'application/octet-stream',
    size: 1024n,
    objectKey: 'group-1/direct/demo.bin',
    multipartUploadId: 'multipart-1',
    uploaderId: 'user-1',
    groupId: 'group-1',
    completedAt: null,
    abortedAt: null,
    createdAt: new Date('2026-05-14T00:00:00.000Z'),
    updatedAt: new Date('2026-05-14T00:00:00.000Z'),
    ...overrides,
  };
}

function createPrismaDouble() {
  return {
    group: {
      findFirst: async () => ({
        id: 'group-1',
        archivedAt: null,
        artifactsConfirmedAt: null,
      }),
    },
    uploadSession: {
      create: async ({ data }: { data: Record<string, unknown> }) => createUploadSession(data),
      findUnique: async () => createUploadSession(),
    },
  };
}

test('initiateUpload delegates extension targets through the registry', async () => {
  const extensionKind = 'CUSTOM_ASSET' as UploadKind;
  const session = createUploadSession({
    kind: extensionKind,
    groupId: null,
  });
  const calls: unknown[][] = [];
  const service = new UploadsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    {
      get: () => ({
        initiate: async (...args: unknown[]) => {
          calls.push(args);
          return session;
        },
      }),
    } as never,
  );
  const dto = {
    kind: extensionKind,
    fileName: 'Reference.png',
    mimeType: 'image/png',
    size: 128,
  };

  const result = await service.initiateUpload('owner-a', dto);

  assert.deepEqual(calls, [['owner-a', dto]]);
  assert.equal(result.kind, extensionKind);
});

test('completeUpload finalizes any registered extension without knowing its domain kind', async () => {
  const events: string[] = [];
  let finalizeArgumentCount = 0;
  const extensionKind = 'CUSTOM_ASSET' as UploadKind;
  const session = createUploadSession({
    kind: extensionKind,
    groupId: null,
    mimeType: 'image/png',
    objectKey: 'custom/owner-a/uploads/upload-1/original.png',
    size: 4n,
  });
  const finalized = {
    kind: extensionKind,
    asset: {
      id: 'asset-1',
      width: 1,
      height: 1,
      durationMs: null,
      lifecycleStatus: 'PROCESSING' as const,
      createdAt: new Date('2026-08-14T00:00:00.000Z'),
      duplicate: false,
    },
  };
  const target = {
    prepareFinalization: async () => {
      events.push('prepare');
      return { sha256: 'abc' };
    },
    finalize: async (...args: unknown[]) => {
      finalizeArgumentCount = args.length;
      events.push('finalize');
      return finalized;
    },
    afterCommit: async () => events.push('afterCommit'),
  };
  const prisma = {
    uploadSession: {
      findUnique: async () => session,
      updateMany: async () => ({ count: 1 }),
    },
    $transaction: async () => {
      throw new Error('registered target transaction must be owned by its handler');
    },
  };
  const files = {
    completeMultipartUpload: async () => undefined,
    assertObjectSize: async () => undefined,
    getStreamFromS3: async () => ({ stream: Readable.from([Buffer.from('demo')]) }),
  };
  const service = new UploadsService(
    prisma as never,
    files as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    { get: () => target } as never,
  );

  const result = await service.completeUpload('user-1', 'upload-1', [
    { partNumber: 1, etag: 'etag-1' },
  ]);

  assert.equal(result, finalized);
  assert.equal(finalizeArgumentCount, 2);
  assert.deepEqual(events, ['prepare', 'finalize', 'afterCommit']);
});

test('initiateUpload creates multipart session for chat attachment', async () => {
  const prisma = createPrismaDouble();
  const filesService = {
    initiateMultipartUpload: async () => ({ uploadId: 'multipart-1' }),
    buildDirectUploadStorageKey: () => 'group-1/direct/demo.bin',
    normalizeDirectUploadOriginalName: (name: string) => name,
  };
  const artifactRepository = { listByGroupAscending: async () => [] };
  const artifactStorageService = { buildStorageKey: () => 'artifacts/group-1/demo.bin' };
  const artifactWorkflowService = {};
  const fileUploadConfigService = {
    getChatAttachmentMaxBytes: async () => 10 * 1024 * 1024 * 1024,
  };

  const service = new UploadsService(
    prisma as never,
    filesService as never,
    artifactRepository as never,
    artifactStorageService as never,
    artifactWorkflowService as never,
    fileUploadConfigService as never,
    {} as never,
    {} as never,
  );

  const result = await service.initiateUpload('user-1', {
    kind: UploadKind.CHAT_ATTACHMENT,
    groupId: 'group-1',
    fileName: 'demo.bin',
    mimeType: 'application/octet-stream',
    size: 1024,
  });

  assert.equal(result.id, 'upload-1');
  assert.equal(result.kind, UploadKind.CHAT_ATTACHMENT);
  assert.equal(result.multipartUploadId, 'multipart-1');
  assert.equal(result.size, 1024);
});

test('initiateUpload aborts the multipart upload when session persistence fails', async () => {
  const abortedUploads: Array<{ objectKey: string; uploadId: string }> = [];
  const service = new UploadsService(
    {
      group: {
        findFirst: async () => ({
          id: 'group-1',
          archivedAt: null,
          artifactsConfirmedAt: null,
        }),
      },
      uploadSession: {
        create: async () => {
          throw new Error('database unavailable');
        },
      },
    } as never,
    {
      initiateMultipartUpload: async () => ({ uploadId: 'multipart-1' }),
      abortMultipartUpload: async (objectKey: string, uploadId: string) => {
        abortedUploads.push({ objectKey, uploadId });
      },
      buildDirectUploadStorageKey: () => 'group-1/direct/demo.bin',
      normalizeDirectUploadOriginalName: (name: string) => name,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      getChatAttachmentMaxBytes: async () => 10 * 1024 * 1024 * 1024,
    } as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () =>
      service.initiateUpload('user-1', {
        kind: UploadKind.CHAT_ATTACHMENT,
        groupId: 'group-1',
        fileName: 'demo.bin',
        mimeType: 'application/octet-stream',
        size: 1024,
      }),
    /database unavailable/,
  );
  assert.deepEqual(abortedUploads, [
    {
      objectKey: 'group-1/direct/demo.bin',
      uploadId: 'multipart-1',
    },
  ]);
});

test('initiateUpload creates a group-free multipart session for a published subscription post', async () => {
  const createdSessions: Array<Record<string, unknown>> = [];
  const createdAttachments: Array<Record<string, unknown>> = [];
  const prisma = {
    user: {
      findUnique: async () => ({ role: 'ADMIN' }),
    },
    subscriptionPost: {
      findUnique: async () => ({ id: 'post-1', status: 'PUBLISHED' }),
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        $queryRaw: async () => [{ id: 'post-1' }],
        subscriptionPost: {
          findUnique: async () => ({ status: 'PUBLISHED' }),
        },
        subscriptionAttachment: {
          count: async () => 0,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdAttachments.push(data);
            return { id: 'attachment-1' };
          },
        },
        uploadSession: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdSessions.push(data);
            return createUploadSession({
              ...data,
              id: 'subscription-upload-1',
              kind: UploadKind.SUBSCRIPTION_ATTACHMENT,
              groupId: null,
              subscriptionAttachmentId: 'attachment-1',
            });
          },
        },
      }),
  };
  const service = new UploadsService(
    prisma as never,
    {
      initiateMultipartUpload: async () => ({ uploadId: 'multipart-subscription-1' }),
      normalizeDirectUploadOriginalName: (name: string) => name,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {
      getSubscriptionAttachmentMaxBytes: async () => 5 * 1024 * 1024 * 1024,
    } as never,
    {
      assertPermission: async () => undefined,
    } as never,
    {
      buildStorageKey: () => 'subscriptions/post-1/attachment.zip',
    } as never,
  );

  const result = await service.initiateUpload('user-1', {
    kind: UploadKind.SUBSCRIPTION_ATTACHMENT,
    postId: 'post-1',
    fileName: 'article-image.png',
    mimeType: 'image/png',
    size: 5 * 1024 * 1024 * 1024,
    subscriptionUsage: 'INLINE_IMAGE',
  });

  assert.equal(result.kind, UploadKind.SUBSCRIPTION_ATTACHMENT);
  assert.equal(result.groupId, null);
  assert.equal(result.subscriptionAttachmentId, 'attachment-1');
  assert.equal(createdSessions[0]?.groupId, undefined);
  assert.equal(createdSessions[0]?.subscriptionAttachmentId, 'attachment-1');
  assert.equal(createdAttachments[0]?.usage, 'INLINE_IMAGE');

  await assert.rejects(
    () =>
      service.initiateUpload('user-1', {
        kind: UploadKind.SUBSCRIPTION_ATTACHMENT,
        postId: 'post-1',
        fileName: 'not-an-image.zip',
        mimeType: 'application/zip',
        size: 1024,
        subscriptionUsage: 'INLINE_IMAGE',
      }),
    BadRequestException,
  );
});

test('initiateUpload infers a safe album MIME from a supported extension when the client omits it', async () => {
  const createdSessions: Array<Record<string, unknown>> = [];
  const service = new UploadsService(
    {
      user: { findUnique: async () => ({ role: 'ADMIN' }) },
      uploadSession: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdSessions.push(data);
          return createUploadSession({
            ...data,
            kind: UploadKind.ALBUM_PHOTO,
            groupId: null,
          });
        },
      },
    } as never,
    {
      initiateMultipartUpload: async () => ({ uploadId: 'album-multipart-1' }),
      normalizeDirectUploadOriginalName: (name: string) => name,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertPermission: async () => undefined } as never,
    {} as never,
    {
      buildStorageKey: () => 'album/originals/photo-1',
    } as never,
  );

  const result = await service.initiateUpload('user-1', {
    kind: UploadKind.ALBUM_PHOTO,
    fileName: 'camera-export.JPEG',
    mimeType: '',
    size: 1024,
  });

  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(createdSessions[0]?.mimeType, 'image/jpeg');
});

test('initiateUpload accepts an MP4 album video with a dedicated video size limit', async () => {
  const createdSessions: Array<Record<string, unknown>> = [];
  const service = new UploadsService(
    {
      user: { findUnique: async () => ({ role: 'ADMIN' }) },
      uploadSession: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          createdSessions.push(data);
          return createUploadSession({
            ...data,
            kind: UploadKind.ALBUM_PHOTO,
            groupId: null,
          });
        },
      },
    } as never,
    {
      initiateMultipartUpload: async () => ({ uploadId: 'album-video-multipart-1' }),
      normalizeDirectUploadOriginalName: (name: string) => name,
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertPermission: async () => undefined } as never,
    {} as never,
    { buildStorageKey: () => 'album/originals/video-1' } as never,
  );

  const result = await service.initiateUpload('user-1', {
    kind: UploadKind.ALBUM_PHOTO,
    fileName: 'summer.MP4',
    mimeType: 'video/mp4',
    size: 100 * 1024 * 1024,
  });

  assert.equal(result.mimeType, 'video/mp4');
  assert.equal(createdSessions[0]?.mimeType, 'video/mp4');

  await assert.rejects(
    () =>
      service.initiateUpload('user-1', {
        kind: UploadKind.ALBUM_PHOTO,
        fileName: 'oversized.mp4',
        mimeType: 'video/mp4',
        size: 100 * 1024 * 1024 + 1,
      }),
    /100MB/,
  );
});

test('uploadPart proxies a multipart part through object storage', async () => {
  const prisma = createPrismaDouble();
  const uploadedParts: Buffer[] = [];
  const filesService = {
    uploadMultipartPart: async (
      objectKey: string,
      multipartUploadId: string,
      partNumber: number,
      body: Buffer,
    ) => {
      assert.equal(objectKey, 'group-1/direct/demo.bin');
      assert.equal(multipartUploadId, 'multipart-1');
      assert.equal(partNumber, 1);
      uploadedParts.push(body);
      return { ETag: 'etag-part-1', PartNumber: partNumber };
    },
  };
  const artifactRepository = { listByGroupAscending: async () => [] };
  const artifactStorageService = { buildStorageKey: () => 'artifacts/group-1/demo.bin' };
  const artifactWorkflowService = {};
  const fileUploadConfigService = {
    getChatAttachmentMaxBytes: async () => 10 * 1024 * 1024 * 1024,
  };

  const service = new UploadsService(
    prisma as never,
    filesService as never,
    artifactRepository as never,
    artifactStorageService as never,
    artifactWorkflowService as never,
    fileUploadConfigService as never,
    {} as never,
    {} as never,
  );

  const result = await service.uploadPart('user-1', 'upload-1', 1, Buffer.from('hello'));

  assert.deepEqual(uploadedParts, [Buffer.from('hello')]);
  assert.deepEqual(result, {
    uploadSessionId: 'upload-1',
    partNumber: 1,
    etag: 'etag-part-1',
  });
});

test('completeUpload preserves an assembled S3 object for recovery when DB finalization fails', async () => {
  const deletedKeys: string[] = [];
  const statusUpdates: string[] = [];
  const prisma = {
    group: {
      findFirst: async () => ({
        id: 'group-1',
        archivedAt: null,
        artifactsConfirmedAt: null,
      }),
    },
    uploadSession: {
      findUnique: async () => createUploadSession({ size: 32 * 1024 * 1024 }),
      updateMany: async ({ data }: { data: { status?: string } }) => {
        if (data.status) statusUpdates.push(data.status);
        return { count: 1 };
      },
    },
    $transaction: async () => {
      throw new Error('database unavailable');
    },
    fileObject: {
      findFirst: async () => {
        throw new Error('should not query DB references on transaction failure');
      },
    },
    groupArtifact: {
      findFirst: async () => {
        throw new Error('should not query DB references on transaction failure');
      },
    },
  };
  const filesService = {
    completeMultipartUpload: async () => undefined,
    hasS3Object: async () => true,
    assertObjectSize: async () => undefined,
    getStreamFromS3: async () => ({
      stream: Readable.from([Buffer.from('demo')]),
    }),
    deleteS3Object: async (storageKey: string) => {
      deletedKeys.push(storageKey);
      return true;
    },
    createDirectFileAccessUrl: () => 'http://backend.test/files/content',
    createDirectFileMetadataUrl: () => 'http://backend.test/files/meta',
    shouldExposeInlineThumbnail: () => false,
    normalizeDirectUploadOriginalName: (name: string) => name,
  };
  const artifactRepository = { listByGroupAscending: async () => [] };
  const artifactStorageService = {
    buildStorageKey: () => 'artifacts/group-1/demo.bin',
    serializeStorageKey: (key: string) => `s3://${key}`,
  };
  const artifactWorkflowService = {};
  const fileUploadConfigService = {
    getChatAttachmentMaxBytes: async () => 10 * 1024 * 1024 * 1024,
  };

  const service = new UploadsService(
    prisma as never,
    filesService as never,
    artifactRepository as never,
    artifactStorageService as never,
    artifactWorkflowService as never,
    fileUploadConfigService as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.completeUpload('user-1', 'upload-1', [{ partNumber: 1, etag: 'etag-part-1' }]),
    /database unavailable/,
  );
  assert.deepEqual(deletedKeys, []);
  assert.deepEqual(statusUpdates, ['ASSEMBLED', 'FAILED']);
});

test('completeUpload keeps an assembled object recoverable when storage validation is transient', async () => {
  const statusUpdates: Array<Record<string, unknown>> = [];
  const service = new UploadsService(
    {
      group: {
        findFirst: async () => ({
          id: 'group-1',
          archivedAt: null,
          artifactsConfirmedAt: null,
        }),
      },
      uploadSession: {
        findUnique: async () => createUploadSession({ size: 32 * 1024 * 1024 }),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          statusUpdates.push(data);
          return { count: 1 };
        },
      },
    } as never,
    {
      completeMultipartUpload: async () => undefined,
      assertObjectSize: async () => {
        throw new Error('MinIO temporarily unavailable');
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.completeUpload('user-1', 'upload-1', [{ partNumber: 1, etag: 'etag-part-1' }]),
    ServiceUnavailableException,
  );

  assert.equal(
    statusUpdates.some((data) => data.status === 'FAILED' || data.finalizationAttempts === 10),
    false,
  );
  assert.equal(
    statusUpdates.some((data) => data.status === 'ASSEMBLED'),
    true,
  );
});

test('completeUpload marks a proven object-size mismatch as a terminal upload failure', async () => {
  const statusUpdates: Array<Record<string, unknown>> = [];
  const service = new UploadsService(
    {
      group: {
        findFirst: async () => ({
          id: 'group-1',
          archivedAt: null,
          artifactsConfirmedAt: null,
        }),
      },
      uploadSession: {
        findUnique: async () => createUploadSession({ size: 32 * 1024 * 1024 }),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          statusUpdates.push(data);
          return { count: 1 };
        },
      },
    } as never,
    {
      completeMultipartUpload: async () => undefined,
      assertObjectSize: async () => {
        throw new ObjectSizeMismatchError(32 * 1024 * 1024, 1024);
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  await assert.rejects(
    () => service.completeUpload('user-1', 'upload-1', [{ partNumber: 1, etag: 'etag-part-1' }]),
    BadRequestException,
  );

  assert.equal(
    statusUpdates.some((data) => data.status === 'FAILED' && data.finalizationAttempts === 10),
    true,
  );
});

test('recoverUploadSession retries multipart completion instead of requiring an assembled object', async () => {
  let completedParts: Array<{ partNumber: number; etag: string }> | undefined;
  let existenceChecks = 0;
  const service = new UploadsService(
    {
      uploadSession: {
        findUnique: async () =>
          createUploadSession({
            completionParts: [{ partNumber: 1, etag: 'etag-part-1' }],
          }),
        updateMany: async () => ({ count: 0 }),
      },
    } as never,
    {
      hasS3Object: async () => {
        existenceChecks += 1;
        return false;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  service.completeUpload = async (_userId, _sessionId, parts) => {
    completedParts = parts;
    return { kind: UploadKind.CHAT_ATTACHMENT, file: { id: 'file-1' } } as never;
  };

  await service.recoverUploadSession('upload-1');

  assert.deepEqual(completedParts, [{ partNumber: 1, etag: 'etag-part-1' }]);
  assert.equal(existenceChecks, 0);
});

test('abortUpload is idempotent after the session was already aborted', async () => {
  let abortCalls = 0;
  const service = new UploadsService(
    {
      uploadSession: {
        findUnique: async () => createUploadSession({ status: 'ABORTED' }),
      },
    } as never,
    {
      abortMultipartUpload: async () => {
        abortCalls += 1;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  assert.deepEqual(await service.abortUpload('user-1', 'upload-1'), {
    uploadSessionId: 'upload-1',
    aborted: true,
  });
  assert.equal(abortCalls, 0);
});

test('completeUpload returns the existing file when a concurrent completion wins', async () => {
  const deletedKeys: string[] = [];
  const prisma = {
    group: {
      findFirst: async () => ({
        id: 'group-1',
        archivedAt: null,
        artifactsConfirmedAt: null,
      }),
    },
    uploadSession: {
      findUnique: async () => createUploadSession({ size: 32 * 1024 * 1024 }),
      updateMany: async () => ({ count: 1 }),
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        uploadSession: {
          updateMany: async () => ({ count: 0 }),
        },
      }),
    fileObject: {
      findFirst: async () => ({
        id: 'file-1',
        groupId: 'group-1',
        originalName: 'demo.bin',
        mimeType: 'application/octet-stream',
        size: 32n * 1024n * 1024n,
        createdAt: new Date('2026-08-11T00:00:00.000Z'),
        uploaderId: 'user-1',
        thumbnailStorageKey: null,
        imageWidth: null,
        imageHeight: null,
      }),
    },
  };
  const filesService = {
    completeMultipartUpload: async () => undefined,
    hasS3Object: async () => true,
    assertObjectSize: async () => undefined,
    getStreamFromS3: async () => ({
      stream: Readable.from([Buffer.from('demo')]),
    }),
    deleteS3Object: async (storageKey: string) => {
      deletedKeys.push(storageKey);
      return true;
    },
    createDirectFileAccessUrl: () => 'http://backend.test/files/content',
    createDirectFileMetadataUrl: () => 'http://backend.test/files/meta',
    shouldExposeInlineThumbnail: () => false,
    normalizeDirectUploadOriginalName: (name: string) => name,
  };
  const artifactRepository = { listByGroupAscending: async () => [] };
  const artifactStorageService = {
    buildStorageKey: () => 'artifacts/group-1/demo.bin',
    serializeStorageKey: (key: string) => `s3://${key}`,
  };
  const artifactWorkflowService = {};
  const fileUploadConfigService = {
    getChatAttachmentMaxBytes: async () => 10 * 1024 * 1024 * 1024,
  };

  const service = new UploadsService(
    prisma as never,
    filesService as never,
    artifactRepository as never,
    artifactStorageService as never,
    artifactWorkflowService as never,
    fileUploadConfigService as never,
    {} as never,
    {} as never,
  );

  const result = await service.completeUpload('user-1', 'upload-1', [
    { partNumber: 1, etag: 'etag-part-1' },
  ]);
  assert.equal(result.kind, UploadKind.CHAT_ATTACHMENT);
  assert.equal(result.file.id, 'file-1');
  assert.deepEqual(deletedKeys, []);
});

test('completeUpload ignores an album photo with an existing SHA-256 hash', async () => {
  const session = createUploadSession({
    kind: UploadKind.ALBUM_PHOTO,
    groupId: null,
    objectKey: 'album/originals/duplicate',
    originalName: 'duplicate.png',
    mimeType: 'image/png',
    size: 1024n,
  });
  const sessionUpdates: Array<Record<string, unknown>> = [];
  const transactionUpdates: Array<Record<string, unknown>> = [];
  let advisoryLockQuery = '';
  let createdPhotos = 0;
  const prisma = {
    uploadSession: {
      findUnique: async () => session,
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        sessionUpdates.push(data);
      },
    },
    albumPhoto: { findMany: async () => [] },
    $transaction: async (callback: (transaction: any) => Promise<unknown>) =>
      callback({
        $queryRaw: async (query: { strings?: readonly string[] }) => {
          advisoryLockQuery = query.strings?.join('?') ?? '';
          return [{ locked: '' }];
        },
        uploadSession: {
          updateMany: async () => ({ count: 1 }),
          update: async ({ data }: { data: Record<string, unknown> }) => {
            transactionUpdates.push(data);
          },
        },
        albumPhoto: {
          findFirst: async () => ({
            id: 'existing-photo',
            width: 1200,
            height: 800,
            createdAt: new Date('2026-08-13T00:00:00.000Z'),
          }),
          create: async () => {
            createdPhotos += 1;
          },
        },
      }),
  };
  const deletedKeys: string[] = [];
  const service = new UploadsService(
    prisma as never,
    {
      completeMultipartUpload: async () => undefined,
      assertObjectSize: async () => undefined,
      getStreamFromS3: async () => ({ stream: Readable.from([Buffer.from('png')]) }),
      getImageDimensionsFromS3Object: async () => ({ width: 1200, height: 800 }),
      deleteS3Object: async (key: string) => {
        deletedKeys.push(key);
        return true;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      computeSha256: async () => 'same-sha256',
      contentUrl: (id: string) => `/content/${id}`,
      thumbnailUrl: (id: string) => `/thumbnail/${id}`,
    } as never,
  );

  const result = await service.completeUpload('user-1', 'upload-1', [
    { partNumber: 1, etag: 'etag-part-1' },
  ]);

  assert.equal(result.kind, UploadKind.ALBUM_PHOTO);
  assert.equal(result.photo.id, 'existing-photo');
  assert.equal(result.photo.duplicate, true);
  assert.match(advisoryLockQuery, /pg_advisory_xact_lock.*::text/s);
  assert.equal(createdPhotos, 0);
  assert.deepEqual(deletedKeys, ['album/originals/duplicate']);
  assert.equal(transactionUpdates[0]?.albumPhotoId, 'existing-photo');
  assert.equal(transactionUpdates[0]?.objectCleanupPending, true);
  assert.equal(sessionUpdates.at(-1)?.objectCleanupPending, false);
});

test('completeUpload reloads the winning album session after concurrent finalization', async () => {
  const initiated = createUploadSession({
    kind: UploadKind.ALBUM_PHOTO,
    groupId: null,
    objectKey: 'album/originals/concurrent-duplicate',
    originalName: 'duplicate.png',
    mimeType: 'image/png',
    size: 1024n,
  });
  const completed = {
    ...initiated,
    status: 'COMPLETED',
    albumPhotoId: 'existing-photo',
  };
  let sessionReads = 0;
  const service = new UploadsService(
    {
      uploadSession: {
        findUnique: async () => {
          sessionReads += 1;
          return sessionReads >= 2 ? completed : initiated;
        },
        updateMany: async () => ({ count: 1 }),
      },
      albumPhoto: {
        findMany: async () => [],
        findFirst: async () => ({
          id: 'existing-photo',
          width: 1200,
          height: 800,
          createdAt: new Date('2026-08-13T00:00:00.000Z'),
        }),
        findUnique: async () => ({ storageKey: 'album/originals/original' }),
      },
      $transaction: async (callback: (transaction: any) => Promise<unknown>) =>
        callback({ uploadSession: { updateMany: async () => ({ count: 0 }) } }),
    } as never,
    {
      completeMultipartUpload: async () => undefined,
      assertObjectSize: async () => undefined,
      getStreamFromS3: async () => ({ stream: Readable.from([Buffer.from('png')]) }),
      getImageDimensionsFromS3Object: async () => ({ width: 1200, height: 800 }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      computeSha256: async () => 'same-sha256',
      contentUrl: (id: string) => `/content/${id}`,
      thumbnailUrl: (id: string) => `/thumbnail/${id}`,
    } as never,
  );

  const result = await service.completeUpload('user-1', 'upload-1', [
    { partNumber: 1, etag: 'etag-part-1' },
  ]);

  assert.equal(result.kind, UploadKind.ALBUM_PHOTO);
  assert.equal(result.photo.id, 'existing-photo');
  assert.equal(result.photo.duplicate, true);
  assert.equal(sessionReads, 2);
});

test('completeUpload marks an unsupported MP4 codec as a terminal upload failure', async () => {
  const statusUpdates: Array<Record<string, unknown>> = [];
  const service = new UploadsService(
    {
      uploadSession: {
        findUnique: async () =>
          createUploadSession({
            kind: UploadKind.ALBUM_PHOTO,
            groupId: null,
            objectKey: 'album/originals/unsupported-video',
            originalName: 'unsupported.mp4',
            mimeType: 'video/mp4',
            size: 1024n,
          }),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          statusUpdates.push(data);
          return { count: 1 };
        },
      },
      albumPhoto: { findMany: async () => [] },
    } as never,
    {
      completeMultipartUpload: async () => undefined,
      assertObjectSize: async () => undefined,
      getStreamFromS3: async () => ({
        stream: Readable.from([Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])]),
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      computeSha256: async () => Promise.reject(new Error('video hash must share inspection IO')),
    } as never,
    {
      inspectAndHash: async () => Promise.reject(new BadRequestException('unsupported codec')),
    } as never,
  );

  await assert.rejects(
    () => service.completeUpload('user-1', 'upload-1', [{ partNumber: 1, etag: 'etag-part-1' }]),
    BadRequestException,
  );

  assert.equal(
    statusUpdates.some((data) => data.status === 'FAILED' && data.finalizationAttempts === 10),
    true,
  );
});

test('completeUpload counts transient MP4 preprocessing failures toward the retry limit', async () => {
  const statusUpdates: Array<Record<string, any>> = [];
  const service = new UploadsService(
    {
      uploadSession: {
        findUnique: async () =>
          createUploadSession({
            kind: UploadKind.ALBUM_PHOTO,
            groupId: null,
            objectKey: 'album/originals/transient-video',
            originalName: 'transient.mp4',
            mimeType: 'video/mp4',
            size: 1024n,
          }),
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          statusUpdates.push(data);
          return { count: 1 };
        },
      },
    } as never,
    {
      completeMultipartUpload: async () => undefined,
      assertObjectSize: async () => undefined,
      getStreamFromS3: async () => ({
        stream: Readable.from([Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])]),
      }),
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { computeSha256: async () => Promise.reject(new Error('must not hash separately')) } as never,
    {
      inspectAndHash: async () => Promise.reject(new ServiceUnavailableException('ffprobe busy')),
    } as never,
  );

  await assert.rejects(
    () => service.completeUpload('user-1', 'upload-1', [{ partNumber: 1, etag: 'etag-part-1' }]),
    ServiceUnavailableException,
  );
  assert.equal(
    statusUpdates.some(
      (data) => data.status === 'FAILED' && data.finalizationAttempts?.increment === 1,
    ),
    true,
  );
});

test('completeUpload returns intrinsic dimensions for image attachments', async () => {
  const prisma = {
    group: {
      findFirst: async () => ({
        id: 'group-1',
        archivedAt: null,
        artifactsConfirmedAt: null,
      }),
    },
    uploadSession: {
      findUnique: async () =>
        createUploadSession({
          mimeType: 'image/png',
          originalName: 'evidence.png',
          size: 32 * 1024 * 1024,
        }),
      updateMany: async () => ({ count: 1 }),
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        uploadSession: {
          updateMany: async () => ({ count: 1 }),
          update: async () => undefined,
        },
        fileObject: {
          create: async () => ({
            id: 'file-1',
            groupId: 'group-1',
            originalName: 'evidence.png',
            mimeType: 'image/png',
            size: 2048n,
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            uploaderId: 'user-1',
            thumbnailStorageKey: null,
            imageWidth: 1200,
            imageHeight: 600,
          }),
        },
      }),
  };
  const filesService = {
    completeMultipartUpload: async () => undefined,
    hasS3Object: async () => true,
    assertObjectSize: async () => undefined,
    getStreamFromS3: async () => ({
      stream: Readable.from([Buffer.from('demo')]),
    }),
    getImageDimensionsFromS3Object: async () => ({ width: 1200, height: 600 }),
    createDirectFileAccessUrl: () => 'http://backend.test/files/content',
    createDirectFileMetadataUrl: () => 'http://backend.test/files/meta',
    createThumbnailAccessUrl: () => 'http://backend.test/files/thumb',
    shouldGenerateThumbnail: (mimeType: string) =>
      mimeType !== 'image/gif' && mimeType !== 'image/svg+xml' && mimeType.startsWith('image/'),
    shouldExposeInlineThumbnail: (mimeType: string, thumbnailStorageKey: string | null) =>
      Boolean(thumbnailStorageKey) && mimeType !== 'image/gif',
    normalizeDirectUploadOriginalName: (name: string) => name,
  };
  const artifactRepository = { listByGroupAscending: async () => [] };
  const artifactStorageService = {
    buildStorageKey: () => 'artifacts/group-1/demo.bin',
    serializeStorageKey: (key: string) => `s3://${key}`,
  };
  const artifactWorkflowService = {};
  const fileUploadConfigService = {
    getChatAttachmentMaxBytes: async () => 10 * 1024 * 1024 * 1024,
  };

  const service = new UploadsService(
    prisma as never,
    filesService as never,
    artifactRepository as never,
    artifactStorageService as never,
    artifactWorkflowService as never,
    fileUploadConfigService as never,
    {} as never,
    {} as never,
  );

  const result = await service.completeUpload('user-1', 'upload-1', [
    { partNumber: 1, etag: 'etag-part-1' },
  ]);

  assert.equal(result.kind, 'CHAT_ATTACHMENT');
  assert.equal(result.file.width, 1200);
  assert.equal(result.file.height, 600);
});

test('completeUpload skips thumbnail generation for gif attachments', async () => {
  let thumbnailReadCount = 0;
  let thumbnailWriteCount = 0;

  const prisma = {
    group: {
      findFirst: async () => ({
        id: 'group-1',
        archivedAt: null,
        artifactsConfirmedAt: null,
      }),
    },
    uploadSession: {
      findUnique: async () =>
        createUploadSession({
          mimeType: 'image/gif',
          originalName: 'animated.gif',
          size: 32 * 1024 * 1024,
        }),
      updateMany: async () => ({ count: 1 }),
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
      callback({
        uploadSession: {
          updateMany: async () => ({ count: 1 }),
          update: async () => undefined,
        },
        fileObject: {
          create: async () => ({
            id: 'file-1',
            groupId: 'group-1',
            originalName: 'animated.gif',
            mimeType: 'image/gif',
            size: 2048n,
            createdAt: new Date('2026-07-01T00:00:00.000Z'),
            uploaderId: 'user-1',
            thumbnailStorageKey: null,
            imageWidth: 480,
            imageHeight: 270,
          }),
        },
      }),
    fileObject: {
      update: async () => undefined,
    },
  };
  const filesService = {
    completeMultipartUpload: async () => undefined,
    hasS3Object: async () => true,
    assertObjectSize: async () => undefined,
    getStreamFromS3: async () => {
      thumbnailReadCount += 1;
      return {
        stream: Readable.from([Buffer.from('demo')]),
      };
    },
    uploadBufferToS3: async () => {
      thumbnailWriteCount += 1;
    },
    getImageDimensionsFromS3Object: async () => ({ width: 480, height: 270 }),
    createDirectFileAccessUrl: () => 'http://backend.test/files/content',
    createDirectFileMetadataUrl: () => 'http://backend.test/files/meta',
    createThumbnailAccessUrl: () => 'http://backend.test/files/thumb',
    shouldGenerateThumbnail: (mimeType: string) =>
      mimeType !== 'image/gif' && mimeType !== 'image/svg+xml' && mimeType.startsWith('image/'),
    shouldExposeInlineThumbnail: (mimeType: string, thumbnailStorageKey: string | null) =>
      Boolean(thumbnailStorageKey) && mimeType !== 'image/gif',
    normalizeDirectUploadOriginalName: (name: string) => name,
  };
  const artifactRepository = { listByGroupAscending: async () => [] };
  const artifactStorageService = {
    buildStorageKey: () => 'artifacts/group-1/demo.bin',
    serializeStorageKey: (key: string) => `s3://${key}`,
  };
  const artifactWorkflowService = {};
  const fileUploadConfigService = {
    getChatAttachmentMaxBytes: async () => 10 * 1024 * 1024 * 1024,
  };

  const service = new UploadsService(
    prisma as never,
    filesService as never,
    artifactRepository as never,
    artifactStorageService as never,
    artifactWorkflowService as never,
    fileUploadConfigService as never,
    {} as never,
    {} as never,
  );

  const result = await service.completeUpload('user-1', 'upload-1', [
    { partNumber: 1, etag: 'etag-part-1' },
  ]);

  assert.equal(result.kind, 'CHAT_ATTACHMENT');
  assert.equal(thumbnailReadCount, 1);
  assert.equal(thumbnailWriteCount, 0);
});
