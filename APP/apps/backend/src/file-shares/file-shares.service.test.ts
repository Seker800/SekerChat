import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FileSharesService } from './file-shares.service';

const activeFileContext = {
  id: 'file-1',
  uploaderId: 'uploader-1',
  originalName: 'release.zip',
  mimeType: 'application/zip',
  size: 4096n,
  storageKey: 'group-1/release.zip',
  group: {
    id: 'group-1',
    isDM: false,
    archivedAt: null,
    members: [{ role: 'ADMIN' }],
  },
  share: null,
};

const users = {
  'admin-1': {
    id: 'admin-1',
    email: 'admin@example.com',
    displayName: '管理员',
    avatarStorageKey: 'avatars/users/admin-1/avatar.png',
  },
  'member-1': {
    id: 'member-1',
    email: 'member@example.com',
    displayName: '普通成员',
    avatarStorageKey: null,
  },
};

function createHarness(fileContext: Record<string, unknown> = activeFileContext) {
  const calls = {
    created: [] as Array<Record<string, unknown>>,
    updated: [] as Array<Record<string, unknown>>,
    updateIncludes: [] as Array<Record<string, unknown> | undefined>,
    revoked: [] as Array<Record<string, unknown>>,
    published: [] as Array<{ groupId: string; options: Record<string, unknown> }>,
  };
  const prisma = {
    fileObject: {
      findFirst: async () => fileContext,
    },
    fileShare: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.created.push(data);
        return {
          ...data,
          id: 'share-1',
          creator: users[data.creatorId as keyof typeof users],
          downloadCount: 0,
          lastDownloadedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      },
      update: async ({
        data,
        include,
      }: {
        data: Record<string, unknown>;
        include?: Record<string, unknown>;
      }) => {
        calls.updated.push(data);
        calls.updateIncludes.push(include);
        return {
          ...(fileContext.share as object),
          ...data,
          id: 'share-1',
          fileId: 'file-1',
          creator:
            users[data.creatorId as keyof typeof users] ??
            (fileContext.share as { creator?: unknown } | null)?.creator,
          downloadCount: 0,
          lastDownloadedAt: null,
        };
      },
      findUnique: async () => null,
      updateMany: async (input: Record<string, unknown>) => {
        calls.revoked.push(input);
        return { count: 2 };
      },
    },
  };
  const credentials = {
    generatePassword: () => 'aB3xSecurePass1',
    generatePublicToken: () => 'stable-public-token',
    hashToken: (value: string) => `hash:${value}`,
    hashPassword: async (value: string) => `password-hash:${value}`,
    verifyPassword: async (value: string, hash: string) => hash === `password-hash:${value}`,
    encryptPassword: (value: string) => `encrypted:${value}`,
    decryptPassword: (value: string) => value.replace('encrypted:', ''),
    createDownloadSession: () => 'signed-session',
    verifyDownloadSession: () => true,
  };
  const filesService = {
    getStreamFromS3: async () => ({
      mimeType: 'application/zip',
      stream: 'stream',
      contentLength: 4096,
      contentRange: undefined,
    }),
  };
  const config = {
    getOrThrow: (key: string) => {
      assert.equal(key, 'APP_BASE_URL');
      return 'http://chat.test';
    },
  };
  const avatars = {
    buildUserAvatarUrl: (userId: string, storageKey: string | null) =>
      storageKey
        ? `http://chat.test/api/avatars/users/${userId}/content?v=${encodeURIComponent(storageKey)}`
        : null,
  };
  const realtime = {
    publishGroupUpdated: async (groupId: string, options: Record<string, unknown>) => {
      calls.published.push({ groupId, options });
    },
  };

  return {
    service: new FileSharesService(
      prisma as never,
      credentials as never,
      filesService as never,
      avatars as never,
      realtime as never,
      config as never,
    ),
    prisma,
    calls,
    realtime,
  };
}

test('unshared file returns a high-entropy draft with a three-day default expiry', async () => {
  const { service } = createHarness();
  const before = Date.now();
  const result = await service.getManagedShare('admin-1', 'group-1', 'file-1');
  const after = Date.now();

  assert.equal(result.exists, false);
  assert.equal(result.status, 'DRAFT');
  assert.equal(result.password, 'aB3xSecurePass1');
  assert.equal(result.url, '');
  assert.equal(result.activatedBy, null);
  assert.ok(new Date(result.expiresAt).getTime() >= before + 3 * 24 * 60 * 60 * 1000);
  assert.ok(new Date(result.expiresAt).getTime() <= after + 3 * 24 * 60 * 60 * 1000);
});

test('creating a share stores encrypted credentials and returns one stable public URL', async () => {
  const { service, calls } = createHarness();
  const result = await service.upsertManagedShare(
    'admin-1',
    'group-1',
    'file-1',
    {
      password: 'aB3xSecurePass1',
      expiresAt: '2026-08-13T10:00:00.000Z',
    },
    new Date('2026-08-10T10:00:00.000Z'),
  );

  assert.equal(calls.created.length, 1);
  assert.equal(calls.created[0].passwordHash, 'password-hash:aB3xSecurePass1');
  assert.equal(calls.created[0].encryptedPassword, 'encrypted:aB3xSecurePass1');
  assert.equal(calls.created[0].publicTokenHash, 'hash:stable-public-token');
  assert.equal(calls.created[0].encryptedPublicToken, 'encrypted:stable-public-token');
  assert.equal(result.url, 'http://chat.test/s#t=stable-public-token');
  assert.deepEqual(result.activatedBy, {
    id: 'admin-1',
    email: 'admin@example.com',
    displayName: '管理员',
    avatarUrl:
      'http://chat.test/api/avatars/users/admin-1/content?v=avatars%2Fusers%2Fadmin-1%2Favatar.png',
  });
  assert.deepEqual(calls.published, [
    {
      groupId: 'group-1',
      options: { actorUserId: 'admin-1', reason: 'file_share_updated' },
    },
  ]);
});

test('a realtime notification failure does not turn a persisted share into an API failure', async () => {
  const { service, calls, realtime } = createHarness();
  realtime.publishGroupUpdated = async () => {
    throw new Error('realtime unavailable');
  };

  const result = await service.upsertManagedShare(
    'admin-1',
    'group-1',
    'file-1',
    {
      password: 'aB3xSecurePass1',
      expiresAt: '2026-08-13T10:00:00.000Z',
    },
    new Date('2026-08-10T10:00:00.000Z'),
  );

  assert.equal(calls.created.length, 1);
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.url, 'http://chat.test/s#t=stable-public-token');
});

test('ordinary members can activate shares for files uploaded by someone else', async () => {
  const { service, calls } = createHarness({
    ...activeFileContext,
    group: { ...(activeFileContext.group as object), members: [{ role: 'MEMBER' }] },
  });

  const result = await service.upsertManagedShare(
    'member-1',
    'group-1',
    'file-1',
    {
      password: 'aB3xSecurePass1',
      expiresAt: '2026-08-13T10:00:00.000Z',
    },
    new Date('2026-08-10T10:00:00.000Z'),
  );

  assert.equal(calls.created[0].creatorId, 'member-1');
  assert.equal(result.activatedBy.displayName, '普通成员');
});

test('concurrent first-time activation reuses the share created by the winning request', async () => {
  const existingShare = {
    id: 'share-1',
    fileId: 'file-1',
    publicTokenHash: 'hash:winning-token',
    encryptedPublicToken: 'encrypted:winning-token',
    passwordHash: 'password-hash:aB3xSecurePass1',
    encryptedPassword: 'encrypted:aB3xSecurePass1',
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: null,
    revokedReason: null,
    downloadCount: 0,
    lastDownloadedAt: null,
    creator: users['admin-1'],
  };
  const { service, prisma, calls } = createHarness();
  let fileLookupCount = 0;
  prisma.fileObject.findFirst = async () => {
    fileLookupCount += 1;
    return fileLookupCount === 1
      ? activeFileContext
      : { ...activeFileContext, share: existingShare };
  };
  prisma.fileShare.create = async () => {
    throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: 'test',
      meta: { target: ['fileId'] },
    });
  };

  const result = await service.upsertManagedShare(
    'member-1',
    'group-1',
    'file-1',
    {
      password: 'Zx8qSecurePass2',
      expiresAt: '2026-08-14T10:00:00.000Z',
    },
    new Date('2026-08-10T10:00:00.000Z'),
  );

  assert.equal(fileLookupCount, 2);
  assert.equal(calls.updated.length, 0);
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.url, 'http://chat.test/s#t=winning-token');
  assert.equal(result.password, 'aB3xSecurePass1');
  assert.equal(result.activatedBy.id, 'admin-1');
});

test('editing an existing share keeps its public token unless rotate is requested', async () => {
  const existingShare = {
    id: 'share-1',
    fileId: 'file-1',
    publicTokenHash: 'hash:existing-token',
    encryptedPublicToken: 'encrypted:existing-token',
    passwordHash: 'password-hash:aB3xSecurePass1',
    encryptedPassword: 'encrypted:aB3xSecurePass1',
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: null,
    revokedReason: null,
    downloadCount: 0,
    lastDownloadedAt: null,
    creator: users['admin-1'],
  };
  const { service, calls } = createHarness({ ...activeFileContext, share: existingShare });
  const result = await service.upsertManagedShare(
    'admin-1',
    'group-1',
    'file-1',
    {
      password: 'Zx8qSecurePass2',
      expiresAt: '2026-08-14T10:00:00.000Z',
    },
    new Date('2026-08-10T10:00:00.000Z'),
  );

  assert.equal(calls.created.length, 0);
  assert.equal(calls.updated.length, 1);
  assert.equal(calls.updated[0].publicTokenHash, undefined);
  assert.equal(calls.updated[0].creatorId, 'admin-1');
  assert.equal(result.url, 'http://chat.test/s#t=existing-token');
});

test('reactivating revoked or expired shares replaces the old public token', async () => {
  const now = new Date('2026-08-10T10:00:00.000Z');
  for (const inactiveState of [
    { expiresAt: new Date('2026-08-13T10:00:00.000Z'), revokedAt: now },
    { expiresAt: new Date('2026-08-09T10:00:00.000Z'), revokedAt: null },
  ]) {
    const existingShare = {
      id: 'share-1',
      fileId: 'file-1',
      publicTokenHash: 'hash:existing-token',
      encryptedPublicToken: 'encrypted:existing-token',
      passwordHash: 'password-hash:aB3xSecurePass1',
      encryptedPassword: 'encrypted:aB3xSecurePass1',
      expiresAt: inactiveState.expiresAt,
      revokedAt: inactiveState.revokedAt,
      revokedReason: inactiveState.revokedAt ? 'USER_REVOKED' : null,
      downloadCount: 0,
      lastDownloadedAt: null,
      creator: users['admin-1'],
    };
    const { service, calls } = createHarness({ ...activeFileContext, share: existingShare });

    const result = await service.upsertManagedShare(
      'member-1',
      'group-1',
      'file-1',
      {
        password: 'Zx8qSecurePass2',
        expiresAt: '2026-08-14T10:00:00.000Z',
      },
      now,
    );

    assert.equal(calls.updated[0].publicTokenHash, 'hash:stable-public-token');
    assert.equal(calls.updated[0].encryptedPublicToken, 'encrypted:stable-public-token');
    assert.equal(result.url, 'http://chat.test/s#t=stable-public-token');
    assert.equal(result.status, 'ACTIVE');
  }
});

test('revoking a share keeps activator identity available to the internal dialog', async () => {
  const existingShare = {
    id: 'share-1',
    fileId: 'file-1',
    publicTokenHash: 'hash:existing-token',
    encryptedPublicToken: 'encrypted:existing-token',
    passwordHash: 'password-hash:aB3xSecurePass1',
    encryptedPassword: 'encrypted:aB3xSecurePass1',
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: null,
    revokedReason: null,
    downloadCount: 0,
    lastDownloadedAt: null,
    creator: users['admin-1'],
  };
  const { service, calls } = createHarness({ ...activeFileContext, share: existingShare });

  const result = await service.revokeManagedShare(
    'member-1',
    'group-1',
    'file-1',
    new Date('2026-08-10T10:00:00.000Z'),
  );

  assert.equal(result.status, 'REVOKED');
  assert.equal(result.activatedBy.id, 'admin-1');
  assert.ok(calls.updateIncludes[0]?.creator);
  assert.deepEqual(calls.published, [
    {
      groupId: 'group-1',
      options: { actorUserId: 'member-1', reason: 'file_share_updated' },
    },
  ]);
});

test('archived channel refuses share creation and invalid password shape is rejected', async () => {
  const archived = createHarness({
    ...activeFileContext,
    group: { ...(activeFileContext.group as object), archivedAt: new Date() },
  });
  await assert.rejects(
    archived.service.upsertManagedShare('admin-1', 'group-1', 'file-1', {
      password: 'aB3xSecurePass1',
      expiresAt: '2026-08-13T10:00:00.000Z',
    }),
    ForbiddenException,
  );

  const active = createHarness();
  await assert.rejects(
    active.service.upsertManagedShare('admin-1', 'group-1', 'file-1', {
      password: '1234',
      expiresAt: '2026-08-13T10:00:00.000Z',
    }),
    BadRequestException,
  );
});

test('download statistics failures are caught instead of becoming unhandled rejections', async () => {
  const share = {
    id: 'share-1',
    publicTokenHash: 'hash:token',
    passwordHash: 'password-hash:aB3xSecurePass1',
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: null,
    revokedReason: null,
    file: {
      originalName: 'release.zip',
      mimeType: 'application/zip',
      size: 4096n,
      storageKey: 'group-1/release.zip',
      group: { archivedAt: null },
    },
  };
  const { service, prisma } = createHarness();
  prisma.fileShare.findUnique = async () => share as never;
  let caught = false;
  prisma.fileShare.update = (() => ({
    catch() {
      caught = true;
    },
  })) as never;

  await service.getPublicFileContent(
    'share-1',
    'signed-session',
    undefined,
    new Date('2026-08-10T10:00:00.000Z'),
  );
  assert.equal(caught, true);
});

test('reactivating an archive-revoked share after unarchive creates a new link', async () => {
  const archivedShare = {
    id: 'share-1',
    fileId: 'file-1',
    publicTokenHash: 'hash:old-token',
    encryptedPublicToken: 'encrypted:old-token',
    passwordHash: 'password-hash:aB3xSecurePass1',
    encryptedPassword: 'encrypted:aB3xSecurePass1',
    expiresAt: new Date('2026-08-13T10:00:00.000Z'),
    revokedAt: new Date('2026-08-10T09:00:00.000Z'),
    revokedReason: 'CHANNEL_ARCHIVED',
    downloadCount: 0,
    lastDownloadedAt: null,
    creator: users['admin-1'],
  };
  const { service, calls } = createHarness({ ...activeFileContext, share: archivedShare });

  const reactivated = await service.upsertManagedShare(
    'admin-1',
    'group-1',
    'file-1',
    {
      password: 'Zx8qSecurePass2',
      expiresAt: '2026-08-14T10:00:00.000Z',
    },
    new Date('2026-08-10T10:00:00.000Z'),
  );
  assert.equal(reactivated.status, 'ACTIVE');
  assert.equal(reactivated.url, 'http://chat.test/s#t=stable-public-token');
  assert.equal(calls.updated[0].publicTokenHash, 'hash:stable-public-token');
  assert.equal(calls.updated[0].encryptedPublicToken, 'encrypted:stable-public-token');
  assert.equal(calls.updated[0].revokedReason, null);
  assert.equal(calls.updated[0].revokedAt, null);
});

test('unlock uses a generic unauthorized response for missing or invalid shares', async () => {
  const { service } = createHarness();
  await assert.rejects(service.unlock('unknown-token', 'aB3xSecurePass1'), UnauthorizedException);
});
