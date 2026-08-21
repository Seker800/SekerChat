import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ArtifactRepository } from './artifact.repository';
import { ArtifactStorageService } from './artifact-storage.service';
import { ArtifactWorkflowService } from './artifact-workflow.service';
import { ArtifactsService } from './artifacts.service';
import { PermissionService } from '../system-config/permission.service';

type UploadedFileLike = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type ArtifactRecordLike = {
  id: string;
  groupId: string;
  uploaderId: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  size: number;
  sourceFileId?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createConfigService(values: Record<string, string | undefined>) {
  return {
    get<T>(key: string): T | undefined {
      return values[key] as T | undefined;
    },
    getOrThrow<T>(key: string): T {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Missing config: ${key}`);
      }
      return value as T;
    },
  };
}

const systemMessageDouble = {
  createSystemMessage: async (..._args: unknown[]) => undefined,
};

function createFilesDouble() {
  const uploadedObjects = new Map<string, { body: Buffer; mimeType: string }>();
  const deletedKeys: string[] = [];
  const copiedObjects: Array<{ sourceKey: string; destinationKey: string; mimeType: string }> = [];

  return {
    uploadedObjects,
    deletedKeys,
    copiedObjects,
    files: {
      uploadBufferToS3: async (storageKey: string, buffer: Buffer, mimeType: string) => {
        uploadedObjects.set(storageKey, { body: Buffer.from(buffer), mimeType });
      },
      deleteS3Object: async (storageKey: string) => {
        deletedKeys.push(storageKey);
        return uploadedObjects.delete(storageKey);
      },
      hasS3Object: async (storageKey: string) => uploadedObjects.has(storageKey),
      getStreamFromS3: async (storageKey: string) => {
        const entry = uploadedObjects.get(storageKey);
        if (!entry) {
          throw new Error('missing object');
        }
        return {
          mimeType: entry.mimeType,
          stream: Buffer.from(entry.body),
        };
      },
      copyS3Object: async (sourceKey: string, destinationKey: string, mimeType: string) => {
        const source = uploadedObjects.get(sourceKey);
        if (!source) {
          throw new Error('missing source object');
        }
        copiedObjects.push({ sourceKey, destinationKey, mimeType });
        uploadedObjects.set(destinationKey, { body: Buffer.from(source.body), mimeType });
      },
      assertAttachmentUsable: async (_userId: string, groupId: string, fileId: string) => ({
        id: fileId,
        groupId,
        storageKey: `${groupId}/source/${fileId}`,
        thumbnailStorageKey: null,
        thumbnailSize: null,
        imageWidth: null,
        imageHeight: null,
        originalName: 'release.zip',
        mimeType: 'application/zip',
        size: BigInt(7),
        uploaderId: 'user-2',
        createdAt: new Date(),
      }),
    },
  };
}

function createRealtimeDouble() {
  const emitGroupUpdatedCalls: string[] = [];
  return {
    emitGroupUpdatedCalls,
    publisher: {
      publishGroupUpdated: async (groupId: string) => {
        emitGroupUpdatedCalls.push(groupId);
      },
    },
  };
}

const realtimeDouble = createRealtimeDouble();

const systemConfigDouble = {
  getRolePermissions: async () => ({
    MEMBER: ['create_group'],
    ADMIN: ['create_group', 'manage_artifacts'],
    SUPER_ADMIN: ['create_group', 'manage_artifacts'],
  }),
};

function createPrismaDouble(options?: {
  archivedAt?: Date | null;
  artifactsConfirmedAt?: Date | null;
  artifactsConfirmedByUserId?: string | null;
  groupName?: string;
  membershipFound?: boolean;
  existingArtifactNames?: string[];
  existingArtifactRecords?: ArtifactRecordLike[];
  workStatus?: string | null;
  attachmentMessageFound?: boolean;
}) {
  const createdAt = new Date('2026-04-02T00:00:00.000Z');
  const createdArtifacts: Array<Record<string, unknown>> = [];
  const deletedArtifacts: string[] = [];
  const artifactRecords: ArtifactRecordLike[] =
    options?.existingArtifactNames?.map((storedName, index) => ({
      id: `artifact-${index + 1}`,
      groupId: 'group-1',
      uploaderId: 'user-1',
      originalName: storedName,
      storedName,
      relativePath: `2026-04-Alpha-Group/${storedName}`,
      mimeType: 'text/plain',
      size: 4,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) ?? [];

  if (options?.existingArtifactRecords) {
    artifactRecords.push(...options.existingArtifactRecords);
  }

  return {
    createdArtifacts,
    deletedArtifacts,
    artifactRecords,
    groupRecord: {
      id: 'group-1',
      name: options?.groupName ?? 'Alpha Group',
      createdAt,
      archivedAt: options?.archivedAt ?? null,
      artifactsConfirmedAt: options?.artifactsConfirmedAt ?? null,
      artifactsConfirmedByUserId: options?.artifactsConfirmedByUserId ?? null,
      workState: options?.workStatus === null ? null : { status: options?.workStatus ?? '打包' },
    },
    prisma: {
      user: {
        findUnique: async () => ({
          displayName: 'User 1',
        }),
      },
      group: {
        findFirst: async () => {
          if (options?.membershipFound === false) {
            return null;
          }

          return {
            id: 'group-1',
            name: options?.groupName ?? 'Alpha Group',
            createdAt,
            archivedAt: options?.archivedAt ?? null,
            artifactsConfirmedAt: options?.artifactsConfirmedAt ?? null,
            artifactsConfirmedByUserId: options?.artifactsConfirmedByUserId ?? null,
            workState:
              options?.workStatus === null ? null : { status: options?.workStatus ?? '打包' },
          };
        },
        findUnique: async () => ({
          id: 'group-1',
          name: options?.groupName ?? 'Alpha Group',
          createdAt,
        }),
        update: async ({
          data,
        }: {
          data: { artifactsConfirmedAt?: Date | null; artifactsConfirmedByUserId?: string | null };
        }) => ({
          id: 'group-1',
          name: options?.groupName ?? 'Alpha Group',
          createdAt,
          archivedAt: options?.archivedAt ?? null,
          artifactsConfirmedAt:
            data.artifactsConfirmedAt !== undefined
              ? data.artifactsConfirmedAt
              : (options?.artifactsConfirmedAt ?? null),
          artifactsConfirmedByUserId:
            data.artifactsConfirmedByUserId !== undefined
              ? data.artifactsConfirmedByUserId
              : (options?.artifactsConfirmedByUserId ?? null),
        }),
      },
      groupArtifact: {
        count: async () => artifactRecords.length,
        findMany: async () => artifactRecords,
        findFirst: async ({
          where,
        }: {
          where?: { id?: string; sourceFileId?: string; groupId?: string };
        }) =>
          artifactRecords.find(
            (artifact) =>
              (where?.id ? artifact.id === where.id : true) &&
              (where?.sourceFileId ? artifact.sourceFileId === where.sourceFileId : true) &&
              (where?.groupId ? artifact.groupId === where.groupId : true),
          ) ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          const created = {
            id: `artifact-${createdArtifacts.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          createdArtifacts.push(created);
          artifactRecords.push(created as never);
          return created;
        },
        delete: async ({ where }: { where: { id: string } }) => {
          deletedArtifacts.push(where.id);
          const index = artifactRecords.findIndex((artifact) => artifact.id === where.id);
          if (index >= 0) {
            artifactRecords.splice(index, 1);
          }
        },
        update: async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { relativePath?: string };
        }) => {
          const index = artifactRecords.findIndex((artifact) => artifact.id === where.id);
          if (index >= 0 && data.relativePath) {
            artifactRecords[index] = {
              ...artifactRecords[index],
              relativePath: data.relativePath,
            };
          }
        },
      },
      message: {
        findFirst: async () =>
          options?.attachmentMessageFound === false ? null : { id: 'message-1' },
      },
      $transaction: async (
        operation: Array<Promise<unknown>> | ((transaction: object) => Promise<unknown>),
      ) =>
        typeof operation === 'function'
          ? operation({
              groupArtifact: {
                findFirst: async ({
                  where,
                }: {
                  where?: { sourceFileId?: string; groupId?: string };
                }) =>
                  artifactRecords.find(
                    (artifact) =>
                      (where?.sourceFileId ? artifact.sourceFileId === where.sourceFileId : true) &&
                      (where?.groupId ? artifact.groupId === where.groupId : true),
                  ) ?? null,
                create: async ({ data }: { data: Record<string, unknown> }) => {
                  const created = {
                    id: `artifact-${createdArtifacts.length + 1}`,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    ...data,
                  };
                  createdArtifacts.push(created);
                  artifactRecords.push(created as never);
                  return created;
                },
              },
              group: {
                update: async () => ({ id: 'group-1' }),
              },
            })
          : Promise.all(operation),
    },
  };
}

function createArtifactConfig() {
  return createConfigService({
    API_BASE_URL: 'http://localhost:3100',
    S3_ENDPOINT: 'http://minio.local',
    S3_BUCKET: 'sekerchat',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
  });
}

function createArtifactsService(
  prismaService: object,
  filesService: object,
  packagingStatuses: string[] = ['打包'],
) {
  const repository = new ArtifactRepository(prismaService as never);
  const storageService = new ArtifactStorageService(
    filesService as never,
    createArtifactConfig() as never,
  );
  const workflowService = new ArtifactWorkflowService(
    prismaService as never,
    systemMessageDouble as never,
    realtimeDouble.publisher as never,
    { enqueue: async () => undefined } as never,
  );
  const permissionService = new PermissionService(systemConfigDouble as never);

  return new ArtifactsService(
    prismaService as never,
    createArtifactConfig() as never,
    repository,
    storageService,
    workflowService,
    permissionService,
    filesService as never,
    {
      isPackagingStatus: async (status: string) => packagingStatuses.includes(status),
    } as never,
  );
}

test('addFileToArtifacts copies a message attachment into channel artifacts while packaging', async () => {
  const prismaDouble = createPrismaDouble({ workStatus: '打包' });
  const filesDouble = createFilesDouble();
  filesDouble.uploadedObjects.set('group-1/source/file-1', {
    body: Buffer.from('release'),
    mimeType: 'application/zip',
  });
  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  const result = await service.addFileToArtifacts('user-1', 'group-1', 'file-1');

  assert.equal(result.sourceFileId, 'file-1');
  assert.equal(result.originalName, 'release.zip');
  assert.equal(filesDouble.copiedObjects.length, 1);
  assert.equal(prismaDouble.createdArtifacts[0]?.sourceFileId, 'file-1');
});

test('addFileToArtifacts accepts a custom work status with packaging capability', async () => {
  const prismaDouble = createPrismaDouble({ workStatus: '准备交付' });
  const filesDouble = createFilesDouble();
  filesDouble.uploadedObjects.set('group-1/source/file-1', {
    body: Buffer.from('release'),
    mimeType: 'application/zip',
  });
  const service = createArtifactsService(
    prismaDouble.prisma,
    filesDouble.files,
    ['准备交付'],
  );

  const result = await service.addFileToArtifacts('user-1', 'group-1', 'file-1');

  assert.equal(result.sourceFileId, 'file-1');
  assert.equal(filesDouble.copiedObjects.length, 1);
});

test('addFileToArtifacts is idempotent for an attachment already in artifacts', async () => {
  const existingArtifact: ArtifactRecordLike = {
    id: 'artifact-existing',
    groupId: 'group-1',
    uploaderId: 'user-1',
    originalName: 'release.zip',
    storedName: 'release.zip',
    relativePath: 's3:artifacts/group-1/from-files/file-1/release.zip',
    mimeType: 'application/zip',
    size: 7,
    sourceFileId: 'file-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prismaDouble = createPrismaDouble({ existingArtifactRecords: [existingArtifact] });
  const filesDouble = createFilesDouble();
  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  const result = await service.addFileToArtifacts('user-1', 'group-1', 'file-1');

  assert.equal(result.id, 'artifact-existing');
  assert.equal(filesDouble.copiedObjects.length, 0);
  assert.equal(prismaDouble.createdArtifacts.length, 0);
});

test('addFileToArtifacts rejects channels outside packaging status', async () => {
  const prismaDouble = createPrismaDouble({ workStatus: 'ing' });
  const filesDouble = createFilesDouble();
  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  await assert.rejects(
    () => service.addFileToArtifacts('user-1', 'group-1', 'file-1'),
    BadRequestException,
  );
});

test('addFileToArtifacts rejects uploaded files that were never attached to a message', async () => {
  const prismaDouble = createPrismaDouble({ attachmentMessageFound: false });
  const filesDouble = createFilesDouble();
  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  await assert.rejects(
    () => service.addFileToArtifacts('user-1', 'group-1', 'file-1'),
    BadRequestException,
  );
});

test('uploadArtifact stores new artifacts in object storage and persists metadata', async (t) => {
  const prismaDouble = createPrismaDouble();
  const filesDouble = createFilesDouble();
  realtimeDouble.emitGroupUpdatedCalls.length = 0;
  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  const result = await service.uploadArtifact('user-1', 'group-1', {
    originalname: 'report.md',
    mimetype: 'text/markdown',
    size: 12,
    buffer: Buffer.from('# hello'),
  } as UploadedFileLike as never);

  assert.equal(result.originalName, 'report.md');
  assert.equal(result.storedName, 'report.md');
  assert.match(result.contentUrl, /\/api\/groups\/group-1\/artifacts\/artifact-1\/content$/);
  assert.equal(prismaDouble.createdArtifacts.length, 1);
  assert.deepEqual(realtimeDouble.emitGroupUpdatedCalls, []);
  assert.match(
    String(prismaDouble.createdArtifacts[0].relativePath),
    /^s3:artifacts\/group-1\/.+\/report\.md$/,
  );
  assert.equal(filesDouble.uploadedObjects.size, 1);
});

test('uploadArtifact auto-renames when the stored file name already exists', async (t) => {
  const prismaDouble = createPrismaDouble({ existingArtifactNames: ['report.md'] });
  const filesDouble = createFilesDouble();
  realtimeDouble.emitGroupUpdatedCalls.length = 0;
  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  const result = await service.uploadArtifact('user-1', 'group-1', {
    originalname: 'report.md',
    mimetype: 'text/markdown',
    size: 7,
    buffer: Buffer.from('second'),
  } as UploadedFileLike as never);

  assert.equal(result.storedName, 'report (2).md');
  assert.deepEqual(realtimeDouble.emitGroupUpdatedCalls, []);
  const [[uploadedKey, uploaded]] = filesDouble.uploadedObjects.entries();
  assert.match(uploadedKey, /^artifacts\/group-1\/.+\/report \(2\)\.md$/);
  assert.equal(uploaded.body.toString('utf8'), 'second');
});

test('uploadArtifact rejects when object storage upload fails', async (t) => {
  const prismaDouble = createPrismaDouble();
  const filesDouble = createFilesDouble();
  filesDouble.files.uploadBufferToS3 = async () => {
    throw new Error('s3 down');
  };
  realtimeDouble.emitGroupUpdatedCalls.length = 0;
  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  await assert.rejects(
    () =>
      service.uploadArtifact('user-1', 'group-1', {
        originalname: 'report.md',
        mimetype: 'text/markdown',
        size: 4,
        buffer: Buffer.from('test'),
      } as UploadedFileLike as never),
    ServiceUnavailableException,
  );
});

test('uploadArtifact rejects non-members and archived groups', async (t) => {
  const filesDouble = createFilesDouble();
  const notMember = createArtifactsService(
    createPrismaDouble({ membershipFound: false }).prisma,
    filesDouble.files,
  );

  await assert.rejects(
    () =>
      notMember.uploadArtifact('user-1', 'group-1', {
        originalname: 'report.md',
        mimetype: 'text/markdown',
        size: 4,
        buffer: Buffer.from('test'),
      } as UploadedFileLike as never),
    ForbiddenException,
  );

  const archived = createArtifactsService(
    createPrismaDouble({ archivedAt: new Date() }).prisma,
    filesDouble.files,
  );

  await assert.rejects(
    () =>
      archived.uploadArtifact('user-1', 'group-1', {
        originalname: 'report.md',
        mimetype: 'text/markdown',
        size: 4,
        buffer: Buffer.from('test'),
      } as UploadedFileLike as never),
    BadRequestException,
  );
});

test('uploadArtifact rejects confirmed artifact workspace until it is unlocked', async (t) => {
  const filesDouble = createFilesDouble();
  const confirmed = createArtifactsService(
    createPrismaDouble({ artifactsConfirmedAt: new Date(), artifactsConfirmedByUserId: 'user-2' })
      .prisma,
    filesDouble.files,
  );

  await assert.rejects(
    () =>
      confirmed.uploadArtifact('user-1', 'group-1', {
        originalname: 'report.md',
        mimetype: 'text/markdown',
        size: 4,
        buffer: Buffer.from('test'),
      } as UploadedFileLike as never),
    BadRequestException,
  );
});

test('confirmArtifacts rejects when the channel has no artifacts yet', async (t) => {
  const filesDouble = createFilesDouble();
  const service = createArtifactsService(createPrismaDouble().prisma, filesDouble.files);

  await assert.rejects(() => service.confirmArtifacts('user-1', 'group-1'), BadRequestException);
});

test('listArtifacts keeps object storage artifacts visible when S3 objects exist', async (t) => {
  const filesDouble = createFilesDouble();
  filesDouble.uploadedObjects.set('artifacts/group-1/abc/report.md', {
    body: Buffer.from('report'),
    mimeType: 'text/markdown',
  });
  const prismaDouble = createPrismaDouble({
    existingArtifactRecords: [
      {
        id: 'artifact-s3',
        groupId: 'group-1',
        uploaderId: 'user-1',
        originalName: 'report.md',
        storedName: 'report.md',
        relativePath: 's3:artifacts/group-1/abc/report.md',
        mimeType: 'text/markdown',
        size: 12,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  const artifacts = await service.listArtifacts('user-1', 'group-1');
  assert.equal(artifacts.find((artifact) => artifact.id === 'artifact-s3')?.fileExists, true);
});

test('deleteArtifact removes the object storage file and database record', async (t) => {
  const filesDouble = createFilesDouble();
  filesDouble.uploadedObjects.set('artifacts/group-1/abc/report.md', {
    body: Buffer.from('report'),
    mimeType: 'text/markdown',
  });
  const prismaDouble = createPrismaDouble({
    existingArtifactRecords: [
      {
        id: 'artifact-s3',
        groupId: 'group-1',
        uploaderId: 'user-1',
        originalName: 'report.md',
        storedName: 'report.md',
        relativePath: 's3:artifacts/group-1/abc/report.md',
        mimeType: 'text/markdown',
        size: 6,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  });

  const service = createArtifactsService(prismaDouble.prisma, filesDouble.files);

  const result = await service.deleteArtifact(
    { sub: 'user-1', role: 'ADMIN' } as never,
    'group-1',
    'artifact-s3',
  );

  assert.deepEqual(result, { artifactId: 'artifact-s3', deleted: true });
  assert.deepEqual(filesDouble.deletedKeys, ['artifacts/group-1/abc/report.md']);
  assert.deepEqual(prismaDouble.deletedArtifacts, ['artifact-s3']);
});
