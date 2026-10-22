import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { test } from 'node:test';
import { GroupPresenter } from '../groups/group-presenter.service';
import { DmService } from './dm.service';

test('createOrGetDM rejects CLI bot targets', async () => {
  const dmService = new DmService(
    {
      user: {
        findUnique: async () => ({
          id: 'cli-bot-1',
          role: 'CLI_BOT',
          isBot: false,
        }),
      },
    } as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () => dmService.createOrGetDM('user-1', 'cli-bot-1'),
    (error: unknown) =>
      error instanceof BadRequestException &&
      error.message === 'Legacy standalone bot does not support DM conversations.',
  );
});

test('createOrGetDM allows agent bot targets', async () => {
  const presenter = new GroupPresenter(
    {
      category: {
        findUnique: async () => null,
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
      buildServerAvatarUrl: () => null,
      buildLegacyServerAvatarUrl: () => null,
    } as any,
    {
      getOnlineUserIds: () => new Set<string>(),
      getBrowserOnlineUserIds: () => new Set<string>(),
    } as any,
  );

  const createdGroup = {
    id: 'dm-group-1',
    name: 'dm',
    dmKey: 'agent-bot-1:user-1',
    category: '私聊',
    isDM: true,
    archivedAt: null,
    artifactsConfirmedAt: null,
    artifactsConfirmedByUserId: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    updatedAt: new Date('2026-05-01T00:00:00.000Z'),
    createdById: 'user-1',
    workState: null,
    members: [
      {
        role: 'MEMBER',
        joinedAt: new Date('2026-05-01T00:00:00.000Z'),
        user: {
          id: 'user-1',
          email: 'user-1@example.com',
          displayName: 'User 1',
          avatarStorageKey: null,
          dndUntil: null,
        },
      },
      {
        role: 'MEMBER',
        joinedAt: new Date('2026-05-01T00:00:00.000Z'),
        user: {
          id: 'agent-bot-1',
          email: 'openclaw@example.com',
          displayName: 'OpenClaw',
          avatarStorageKey: null,
          dndUntil: null,
        },
      },
    ],
    messages: [],
  };

  const dmService = new DmService(
    {
      user: {
        findUnique: async () => ({
          id: 'agent-bot-1',
          role: 'CLI_BOT',
          isBot: true,
        }),
      },
      group: {
        findUnique: async () => null,
        findMany: async () => [],
      },
      $transaction: async (callback: Function) =>
        callback({
          group: {
            findUnique: async () => null,
            create: async () => createdGroup,
          },
        }),
    } as any,
    presenter,
    {} as any,
  );

  const result = await dmService.createOrGetDM('user-1', 'agent-bot-1');
  assert.equal(result.isDM, true);
  assert.equal(result.id, 'dm-group-1');
});


test('a concurrent DM winner is read outside the failed transaction', async () => {
  const { Prisma } = await import('@prisma/client');
  let failed = false;
  const winner = { id: 'dm', members: [{ user: { id: 'a' } }, { user: { id: 'b' } }] };
  const service = new DmService({
    user: { findUnique: async () => ({ id: 'b', role: 'MEMBER', isBot: false }) },
    group: { findUnique: async () => failed ? winner : null, findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({ group: {
      findUnique: async () => { if (failed) throw new Error('transaction aborted'); return null; },
      create: async () => { failed = true; throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '6.19.3' }); },
    } }),
  } as never, { serializeGroup: async (group: unknown) => group } as never, {} as never);
  assert.equal((await service.createOrGetDM('a', 'b') as { id: string }).id, 'dm');
});

test('reopening a DM restores a participant removed by older leave behavior', async () => {
  const restored: string[] = [];
  const group = { id: 'dm', members: [{ user: { id: 'b' } }] };
  const tx = {
    groupMember: { upsert: async ({ create }: { create: { userId: string } }) => { restored.push(create.userId); } },
    group: { findUniqueOrThrow: async () => ({ ...group, members: [{ user: { id: 'a' } }, ...group.members] }) },
  };
  const service = new DmService({
    user: { findUnique: async () => ({ id: 'b', role: 'MEMBER', isBot: false }) },
    group: { findUnique: async () => group },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
  } as never, { serializeGroup: async (value: unknown) => value } as never, {} as never);
  await service.createOrGetDM('a', 'b');
  assert.deepEqual(restored, ['a']);
});
