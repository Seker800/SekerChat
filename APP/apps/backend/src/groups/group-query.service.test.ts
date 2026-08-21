import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupQueryService } from './group-query.service';
import { GroupMembershipService } from './group-membership.service';
import { GroupPresenter, GroupSerializePrefetch } from './group-presenter.service';
import { BadRequestException } from '@nestjs/common';

test('buildGroupSerializePrefetch batches category and user lookups', async () => {
  const categoryQueries: string[][] = [];
  const userQueries: string[][] = [];

  const prismaService = {
    category: {
      findMany: async ({ where }: { where: { name: { in: string[] } } }) => {
        categoryQueries.push(where.name.in);
        return where.name.in.map((name: string) => ({ name, avatarStorageKey: `avatar-${name}` }));
      },
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        userQueries.push(where.id.in);
        return where.id.in.map((id: string) => ({ id, displayName: `User ${id}` }));
      },
    },
  };

  const membershipService = {} as GroupMembershipService;
  const presenter = {} as GroupPresenter;

  const service = new (GroupQueryService as any)(prismaService, membershipService, presenter);

  const groups = [
    { category: 'engineering', artifactsConfirmedByUserId: 'user-1' },
    { category: 'engineering', artifactsConfirmedByUserId: null },
    { category: 'design', artifactsConfirmedByUserId: 'user-2' },
    { category: 'design', artifactsConfirmedByUserId: 'user-1' },
  ];

  const prefetch = await service.buildGroupSerializePrefetch(groups);

  // Categories deduped to one batch query
  assert.equal(categoryQueries.length, 1);
  assert.deepEqual(categoryQueries[0]!.sort(), ['design', 'engineering']);

  // Users deduped to one batch query
  assert.equal(userQueries.length, 1);
  assert.deepEqual(userQueries[0]!.sort(), ['user-1', 'user-2']);

  assert.equal(prefetch.categoryAvatars.get('engineering'), 'avatar-engineering');
  assert.equal(prefetch.categoryAvatars.get('design'), 'avatar-design');
  assert.equal(prefetch.userDisplayNames.get('user-1'), 'User user-1');
  assert.equal(prefetch.userDisplayNames.get('user-2'), 'User user-2');
});

test('buildGroupSerializePrefetch handles empty confirmedByUserIds', async () => {
  const userQueries: string[][] = [];

  const prismaService = {
    category: {
      findMany: async () => [],
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        userQueries.push(where.id.in);
        return [];
      },
    },
  };

  const service = new (GroupQueryService as any)(
    prismaService,
    {} as GroupMembershipService,
    {} as GroupPresenter,
  );

  const prefetch = await service.buildGroupSerializePrefetch([
    { category: 'engineering', artifactsConfirmedByUserId: null },
  ]);

  // No user query when all confirmedByUserId are null
  assert.equal(userQueries.length, 0);
  assert.equal(prefetch.userDisplayNames.size, 0);
});

test('buildGroupSerializePrefetch handles empty category list', async () => {
  const categoryQueries: string[][] = [];

  const prismaService = {
    category: {
      findMany: async ({ where }: { where: { name: { in: string[] } } }) => {
        categoryQueries.push(where.name.in);
        return [];
      },
    },
    user: {
      findMany: async () => [],
    },
  };

  const service = new (GroupQueryService as any)(
    prismaService,
    {} as GroupMembershipService,
    {} as GroupPresenter,
  );

  const prefetch = await service.buildGroupSerializePrefetch([]);

  // No category query when no groups
  assert.equal(categoryQueries.length, 0);
  assert.equal(prefetch.categoryAvatars.size, 0);
});

test('listGroups passes prefetch to serializeGroup', async () => {
  const prefetchPassed: GroupSerializePrefetch[] = [];
  const groups = [
    {
      id: 'group-1',
      category: 'engineering',
      artifactsConfirmedByUserId: null,
    },
    {
      id: 'group-2',
      category: 'design',
      artifactsConfirmedByUserId: 'user-c',
    },
  ];

  const prismaService = {
    group: {
      findMany: async () => groups,
    },
    category: {
      findMany: async () => [
        { name: 'engineering', avatarStorageKey: 'a1' },
        { name: 'design', avatarStorageKey: 'a2' },
      ],
    },
    user: {
      findMany: async () => [{ id: 'user-c', displayName: 'Charlie' }],
    },
    groupMember: {
      findMany: async () => [],
    },
    $queryRaw: async () => [],
  };

  const membershipService = {
    getMembershipOrThrow: async () => ({ role: 'MEMBER' }),
  } as any;

  const presenter = {
    serializeGroup: async (
      _group: any,
      _userId: string,
      _role: any,
      _unread: number,
      prefetch?: GroupSerializePrefetch,
    ) => {
      prefetchPassed.push(prefetch!);
      return { id: _group.id };
    },
  } as GroupPresenter;

  const service = new GroupQueryService(prismaService as any, membershipService, presenter);

  await service.listGroups('user-1', false);

  assert.equal(prefetchPassed.length, 2);
  // Both calls received the same prefetch object
  assert.equal(prefetchPassed[0], prefetchPassed[1]);
  assert.ok(prefetchPassed[0]!.categoryAvatars.has('engineering'));
  assert.ok(prefetchPassed[0]!.categoryAvatars.has('design'));
  assert.equal(prefetchPassed[0]!.userDisplayNames.get('user-c'), 'Charlie');
});

test('getGroup does not pass prefetch (single group, no batching needed)', async () => {
  const prefetchPassed: (GroupSerializePrefetch | undefined)[] = [];

  const group = {
    id: 'group-1',
    category: 'engineering',
    artifactsConfirmedByUserId: null,
  };

  const prismaService = {
    group: {
      findUnique: async () => group,
    },
    groupMember: {
      findMany: async () => [{ groupId: 'group-1', userId: 'user-1', lastReadEventSequence: 0n }],
    },
    message: {
      findFirst: async () => null,
    },
    $queryRaw: async () => [],
  };

  const membershipService = {
    getMembershipOrThrow: async () => ({ role: 'MEMBER' }),
  } as any;

  const presenter = {
    serializeGroup: async (
      _group: any,
      _role: any,
      _userId: string,
      _unread: number,
      prefetch?: GroupSerializePrefetch,
    ) => {
      prefetchPassed.push(prefetch);
      return { id: _group.id };
    },
  } as GroupPresenter;

  const service = new GroupQueryService(prismaService as any, membershipService, presenter);

  await service.getGroup('user-1', 'group-1');

  assert.equal(prefetchPassed.length, 1);
  assert.equal(prefetchPassed[0], undefined);
});

test('advanceReadCursor only advances a member cursor to a message in the same group', async () => {
  const updates: unknown[] = [];
  const prismaService = {
    groupMember: {
      findUnique: async () => ({ lastReadEventSequence: 10n }),
      updateMany: async (args: unknown) => {
        updates.push(args);
        return { count: 1 };
      },
    },
    message: {
      findFirst: async () => ({ eventSequence: 42n }),
    },
  };
  const service = new GroupQueryService(
    prismaService as any,
    {} as GroupMembershipService,
    {} as GroupPresenter,
  );

  const result = await service.advanceReadCursor('user-1', 'group-1', 42n);

  assert.deepEqual(result, {
    groupId: 'group-1',
    lastReadEventSequence: '42',
    changed: true,
  });
  assert.deepEqual(updates, [
    {
      where: {
        groupId: 'group-1',
        userId: 'user-1',
        OR: [
          { lastReadEventSequence: null },
          { lastReadEventSequence: { lt: 42n } },
        ],
      },
      data: { lastReadEventSequence: 42n },
    },
  ]);
});

test('advanceReadCursor is a no-op when the cursor is already ahead', async () => {
  let updateCalls = 0;
  const prismaService = {
    groupMember: {
      findUnique: async () => ({ lastReadEventSequence: 50n }),
      updateMany: async () => {
        updateCalls += 1;
        return { count: 1 };
      },
    },
    message: {
      findFirst: async () => ({ eventSequence: 42n }),
    },
  };
  const service = new GroupQueryService(
    prismaService as any,
    {} as GroupMembershipService,
    {} as GroupPresenter,
  );

  const result = await service.advanceReadCursor('user-1', 'group-1', 42n);

  assert.deepEqual(result, {
    groupId: 'group-1',
    lastReadEventSequence: '50',
    changed: false,
  });
  assert.equal(updateCalls, 0);
});

test('advanceReadCursor rejects values outside the PostgreSQL bigint range before querying', async () => {
  let membershipQueries = 0;
  const service = new GroupQueryService(
    {
      groupMember: {
        findUnique: async () => {
          membershipQueries += 1;
          return null;
        },
      },
    } as any,
    {} as GroupMembershipService,
    {} as GroupPresenter,
  );

  await assert.rejects(
    () => service.advanceReadCursor('user-1', 'group-1', 9_223_372_036_854_775_808n),
    BadRequestException,
  );
  assert.equal(membershipQueries, 0);
});
