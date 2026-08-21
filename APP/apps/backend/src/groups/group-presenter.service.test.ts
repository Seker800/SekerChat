import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupPresenter, GroupSerializePrefetch } from './group-presenter.service';
import { GroupWithMembers } from './group-types';

function makeBasicGroup(overrides: Partial<GroupWithMembers> = {}): GroupWithMembers {
  return {
    id: 'group-1',
    name: '测试群组',
    category: 'engineering',
    serverId: null,
    server: null,
    isDM: false,
    archivedAt: null,
    artifactsConfirmedAt: null,
    artifactsConfirmedByUserId: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-15T00:00:00.000Z'),
    createdById: 'user-1',
    workState: null,
    members: [
      {
        role: 'ADMIN',
        joinedAt: new Date('2026-05-01T00:00:00.000Z'),
        user: {
          id: 'user-1',
          email: 'alice@example.com',
          displayName: 'Alice',
          avatarStorageKey: 'avatar-alice',
          dndUntil: null,
        },
      },
      {
        role: 'MEMBER',
        joinedAt: new Date('2026-05-10T00:00:00.000Z'),
        user: {
          id: 'user-2',
          email: 'bob@example.com',
          displayName: 'Bob',
          avatarStorageKey: 'avatar-bob',
          dndUntil: null,
        },
      },
    ],
    messages: [],
    ...overrides,
  };
}

function makePresenter(
  overrides: {
    prismaCategory?: { name: string; avatarStorageKey: string | null } | null;
    resolvedUserName?: string;
    onlineIds?: string[];
  } = {},
) {
  const prismaService = {
    category: {
      findUnique: async () => overrides.prismaCategory ?? null,
    },
    user: {
      findUnique: async () => null,
    },
  };

  const avatarsService = {
    buildUserAvatarUrl: (_userId: string, storageKey: string | null) =>
      storageKey ? `https://cdn.example.com/avatars/${storageKey}` : null,
    buildServerAvatarUrl: (_category: string, storageKey: string | null) =>
      storageKey ? `https://cdn.example.com/servers/${_category}/${storageKey}` : null,
    buildLegacyServerAvatarUrl: (_category: string, storageKey: string | null) =>
      storageKey ? `https://cdn.example.com/servers/${_category}/${storageKey}` : null,
  };

  const realtimeService = {
    getOnlineUserIds: () => new Set(overrides.onlineIds ?? []),
    getBrowserOnlineUserIds: () => new Set(overrides.onlineIds ?? []),
  };

  // Mock resolveGroupUserName via a minimal override: the presenter imports
  // resolveGroupUserName from './group-name' at module scope, so we use the
  // prismaService.user.findUnique path that resolveGroupUserName calls
  // internally. When we don't pass a specific override, the default null
  // return makes resolveGroupUserName return '未知用户'.

  return new GroupPresenter(prismaService as any, avatarsService as any, realtimeService as any);
}

test('serializeGroup uses prefetch for category avatar instead of querying DB', async () => {
  let dbQueryCount = 0;
  const presenter = new GroupPresenter(
    {
      category: {
        findUnique: async () => {
          dbQueryCount++;
          return { avatarStorageKey: 'db-avatar' };
        },
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
      buildServerAvatarUrl: (_category: string, key: string | null) => key ?? null,
      buildLegacyServerAvatarUrl: (_category: string, key: string | null) => key ?? null,
    } as any,
    { getOnlineUserIds: () => new Set([]), getBrowserOnlineUserIds: () => new Set([]) } as any,
  );

  const prefetch: GroupSerializePrefetch = {
    categoryArchivedAts: new Map(),
    categoryAvatars: new Map([['engineering', 'prefetched-avatar']]),
    userDisplayNames: new Map(),
  };

  await presenter.serializeGroup(makeBasicGroup(), 'MEMBER', 'user-1', 0, prefetch);

  assert.equal(dbQueryCount, 0);
});

test('serializeGroup returns null avatar when prefetch is provided but category is missing', async () => {
  let dbQueryCount = 0;
  const presenter = new GroupPresenter(
    {
      category: {
        findUnique: async () => {
          dbQueryCount++;
          return { avatarStorageKey: 'db-avatar' };
        },
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
      buildServerAvatarUrl: (_category: string, key: string | null) => key ?? null,
      buildLegacyServerAvatarUrl: (_category: string, key: string | null) => key ?? null,
    } as any,
    { getOnlineUserIds: () => new Set([]), getBrowserOnlineUserIds: () => new Set([]) } as any,
  );

  // When prefetch is provided, code trusts the map and does NOT fall back to DB
  const prefetch: GroupSerializePrefetch = {
    categoryArchivedAts: new Map(),
    categoryAvatars: new Map(), // empty map
    userDisplayNames: new Map(),
  };

  const result = await presenter.serializeGroup(makeBasicGroup(), 'MEMBER', 'user-1', 0, prefetch);

  assert.equal(dbQueryCount, 0);
  assert.equal(result.serverAvatarUrl, null);
});

test('serializeGroup uses prefetch for confirmedByDisplayName', async () => {
  let dbQueryCount = 0;
  const presenter = new GroupPresenter(
    {
      category: {
        findUnique: async () => {
          dbQueryCount++;
          return { avatarStorageKey: 'cat-avatar' };
        },
      },
      user: {
        findUnique: async () => {
          dbQueryCount++;
          return { displayName: 'Bob' };
        },
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
      buildServerAvatarUrl: (_category: string, key: string | null) => key ?? null,
      buildLegacyServerAvatarUrl: (_category: string, key: string | null) => key ?? null,
    } as any,
    { getOnlineUserIds: () => new Set([]), getBrowserOnlineUserIds: () => new Set([]) } as any,
  );

  const prefetch: GroupSerializePrefetch = {
    categoryArchivedAts: new Map(),
    categoryAvatars: new Map([['engineering', 'cat-avatar']]),
    userDisplayNames: new Map([['user-2', 'Bob (prefetched)']]),
  };

  const result = await presenter.serializeGroup(
    makeBasicGroup({
      artifactsConfirmedByUserId: 'user-2',
      artifactsConfirmedAt: new Date('2026-05-12'),
    }),
    'MEMBER',
    'user-1',
    0,
    prefetch,
  );

  assert.equal(dbQueryCount, 0);
  assert.equal(result.artifactConfirmation.confirmedByDisplayName, 'Bob (prefetched)');
});

test('serializeGroup uses 未知用户 when prefetch misses confirmedByUserId', async () => {
  const prefetch: GroupSerializePrefetch = {
    categoryArchivedAts: new Map(),
    categoryAvatars: new Map([['engineering', 'cat-avatar']]),
    userDisplayNames: new Map(), // empty, user-2 not here
  };

  const result = await makePresenter().serializeGroup(
    makeBasicGroup({
      artifactsConfirmedByUserId: 'user-2',
      artifactsConfirmedAt: new Date('2026-05-12'),
    }),
    'MEMBER',
    'user-1',
    0,
    prefetch,
  );

  assert.equal(result.artifactConfirmation.confirmedByDisplayName, '未知用户');
});

test('serializeGroup without prefetch queries DB for both category and confirmedByUserName', async () => {
  const dbCalls: string[] = [];
  const presenter = new GroupPresenter(
    {
      category: {
        findUnique: async () => {
          dbCalls.push('category');
          return { avatarStorageKey: 'cat-avatar' };
        },
      },
      user: {
        findUnique: async () => {
          dbCalls.push('user');
          return { displayName: 'Charlie' };
        },
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
      buildServerAvatarUrl: (_category: string, key: string | null) => key ?? null,
      buildLegacyServerAvatarUrl: (_category: string, key: string | null) => key ?? null,
    } as any,
    { getOnlineUserIds: () => new Set([]), getBrowserOnlineUserIds: () => new Set([]) } as any,
  );

  await presenter.serializeGroup(
    makeBasicGroup({
      artifactsConfirmedByUserId: 'user-3',
      artifactsConfirmedAt: new Date('2026-05-12'),
    }),
    'MEMBER',
    'user-1',
  );

  assert.deepEqual(dbCalls, ['category', 'user']);
});

test('serializeGroup does not include confirmedByDisplayName when artifactsConfirmedByUserId is null', async () => {
  const result = await makePresenter().serializeGroup(
    makeBasicGroup({ artifactsConfirmedByUserId: null }),
    'MEMBER',
    'user-1',
  );

  assert.equal(result.artifactConfirmation.confirmedByDisplayName, null);
  assert.equal(result.artifactConfirmation.confirmedByUserId, null);
  assert.equal(result.artifactConfirmation.isConfirmed, false);
});

test('serializeGroup resolves DM partner name from members', async () => {
  const group = makeBasicGroup({
    isDM: true,
    name: '',
    members: [
      {
        role: 'MEMBER',
        joinedAt: new Date('2026-05-01T00:00:00.000Z'),
        user: {
          id: 'user-1',
          email: 'alice@example.com',
          displayName: 'Alice',
          avatarStorageKey: null,
          dndUntil: null,
        },
      },
      {
        role: 'MEMBER',
        joinedAt: new Date('2026-05-01T00:00:00.000Z'),
        user: {
          id: 'user-2',
          email: 'bob@example.com',
          displayName: 'Bob',
          avatarStorageKey: null,
          dndUntil: null,
        },
      },
    ],
  });

  const result = await makePresenter().serializeGroup(group, 'MEMBER', 'user-1');

  assert.equal(result.name, 'Bob');
});

test('serializeGroup includes online/dnd status in member list', async () => {
  const result = await makePresenter({ onlineIds: ['user-2'] }).serializeGroup(
    makeBasicGroup(),
    'MEMBER',
    'user-1',
  );

  assert.equal(result.members[0]!.isOnline, false);
  assert.equal(result.members[0]!.isDnd, false);
  assert.equal(result.members[1]!.isOnline, true);
});

test('serializeGroup suppresses dnd badge for offline members', async () => {
  const result = await makePresenter().serializeGroup(
    makeBasicGroup({
      members: [
        {
          role: 'ADMIN',
          joinedAt: new Date('2026-05-01T00:00:00.000Z'),
          user: {
            id: 'user-1',
            email: 'alice@example.com',
            displayName: 'Alice',
            avatarStorageKey: 'avatar-alice',
            dndUntil: new Date('9999-12-31T23:59:59.999Z'),
          },
        },
      ],
    }),
    'MEMBER',
    'user-1',
  );

  assert.equal(result.members[0]!.isOnline, false);
  assert.equal(result.members[0]!.isDnd, false);
});
