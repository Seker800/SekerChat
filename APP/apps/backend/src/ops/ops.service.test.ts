import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import { OpsService } from './ops.service';
import { ArchiveGroupApplicationService } from '../group-lifecycle/archive-group-application.service';

function createServiceHarness(options?: {
  adminMember?: boolean;
  groupMember?: boolean;
  actorRole?: 'ADMIN' | 'MEMBER';
  archiveStatus?: boolean;
}) {
  const calls = {
    groupWorkStateUpsert: [] as Array<Record<string, unknown>>,
    groupWorkStateHistoryCreate: [] as Array<Record<string, unknown>>,
    lifecycleEvents: [] as Array<Record<string, unknown>>,
    revokedShareGroups: [] as string[],
  };

  const prisma: any = {
    group: {
      findUnique: async () => ({ archivedAt: null }),
      update: async () => undefined,
      updateMany: async () => ({ count: options?.archiveStatus ? 1 : 0 }),
    },
    fileShare: {
      updateMany: async (input: { where: { file: { groupId: string } } }) => {
        calls.revokedShareGroups.push(input.where.file.groupId);
        return { count: 1 };
      },
    },
    groupMember: {
      findUnique: async ({
        where,
      }: {
        where: { groupId_userId: { groupId: string; userId: string } };
      }) => {
        if (where.groupId_userId.userId === 'actor-admin') {
          if (options?.adminMember === false) {
            return null;
          }

          return {
            groupId: where.groupId_userId.groupId,
            userId: 'actor-admin',
            role: options?.actorRole ?? 'ADMIN',
            group: {
              archivedAt: null,
            },
          };
        }

        if (options?.groupMember === false) {
          return null;
        }

        return {
          groupId: where.groupId_userId.groupId,
          userId: where.groupId_userId.userId,
          role: 'MEMBER',
          group: {
            archivedAt: null,
          },
        };
      },
    },
    groupWorkState: {
      findUnique: async () => null,
      upsert: async (input: Record<string, unknown>) => {
        calls.groupWorkStateUpsert.push(input);
        return {
          id: 'state-1',
          groupId: 'group-1',
          status: '阻塞',
          reason: 'Need admin decision',
          sourceMessageIds: ['m1', 'm2'],
          updatedByActorType: 'human_user',
          updatedByActorId: 'actor-admin',
          createdAt: new Date('2026-04-07T09:00:00.000Z'),
          updatedAt: new Date('2026-04-07T09:00:00.000Z'),
        };
      },
    },
    groupWorkStateHistory: {
      create: async (input: Record<string, unknown>) => {
        calls.groupWorkStateHistoryCreate.push(input);
        return {
          id: 'history-1',
          ...input,
        };
      },
    },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) => callback(prisma),
    user: {
      findUnique: async () => ({ displayName: '管理员' }),
    },
  };

  const permissionService = {
    assertPermission: async (role: string, permission: string) => {
      const rolePermissions = {
        MEMBER: ['create_group', 'invite_members', 'remove_members', 'archive_group'],
        ADMIN: [
          'create_group',
          'invite_members',
          'remove_members',
          'manage_work_status',
          'archive_group',
          'manage_user_roles',
          'manage_system_config',
          'upload_server_avatar',
          'view_all_groups',
          'join_any_group',
          'access_admin_page',
        ],
        SUPER_ADMIN: [
          'create_group',
          'invite_members',
          'remove_members',
          'manage_work_status',
          'archive_group',
          'manage_user_roles',
          'manage_system_config',
          'upload_server_avatar',
          'view_all_groups',
          'join_any_group',
          'access_admin_page',
        ],
      };
      if (!(rolePermissions as Record<string, string[]>)[role]?.includes(permission)) {
        throw new ForbiddenException('Insufficient permissions.');
      }
    },
  };
  const workStatusConfigService = {
    isArchiveStatus: async () => options?.archiveStatus ?? false,
  };
  const archiveGroupApplicationService = new ArchiveGroupApplicationService(
    prisma as never,
    {
      enqueue: async (_transaction: unknown, event: Record<string, unknown>) => {
        calls.lifecycleEvents.push(event);
      },
    } as never,
  );

  const service = new OpsService(
    prisma as never,
    permissionService as never,
    workStatusConfigService as never,
    archiveGroupApplicationService as never,
  );
  return { service, calls };
}

test('getGroupWorkState returns default payload when the group has no stored state', async () => {
  const { service } = createServiceHarness();

  const result = await service.getGroupWorkState('member-1', 'group-1');

  assert.equal(result.groupId, 'group-1');
  assert.equal(result.status, '初始');
  assert.equal(result.reason, null);
});

test('setGroupWorkState upserts state and appends history entry', async () => {
  const { service, calls } = createServiceHarness();

  const result = await service.setGroupWorkState({ sub: 'actor-admin', role: 'ADMIN' }, 'group-1', {
    status: '阻塞',
    reason: 'Need admin decision',
    sourceMessageIds: ['m1', 'm2'],
  });

  assert.equal(result.status, '阻塞');
  assert.equal(calls.groupWorkStateUpsert.length, 1);
  assert.equal(calls.groupWorkStateHistoryCreate.length, 1);
  assert.equal(calls.lifecycleEvents.length, 1);
  assert.equal(calls.lifecycleEvents[0].eventType, 'group.lifecycle.changed.v1');
  assert.match(JSON.stringify(calls.groupWorkStateHistoryCreate[0]), /阻塞/);
});

test('archive work status revokes shares in the same transaction as the state change', async () => {
  const { service, calls } = createServiceHarness({ archiveStatus: true });

  await service.setGroupWorkState({ sub: 'actor-admin', role: 'ADMIN' }, 'group-1', {
    status: '完成',
  });

  assert.deepEqual(calls.revokedShareGroups, ['group-1']);
  assert.equal(calls.lifecycleEvents.length, 1);
  assert.match(JSON.stringify(calls.lifecycleEvents[0]), /频道已自动归档/);
});

test('setGroupWorkState persists explicit actorType when provided', async () => {
  const { service, calls } = createServiceHarness();

  await service.setGroupWorkState(
    { sub: 'actor-admin', role: 'ADMIN' } as never,
    'group-1',
    { status: 'ing' },
    { actorType: 'AGENT_BOT' },
  );

  assert.equal(calls.groupWorkStateUpsert.length, 1);
  assert.equal(calls.groupWorkStateHistoryCreate.length, 1);
  assert.equal((calls.groupWorkStateUpsert[0] as any).update.updatedByActorType, 'AGENT_BOT');
  assert.equal((calls.groupWorkStateHistoryCreate[0] as any).data.actorType, 'AGENT_BOT');
});

test('setGroupWorkState requires admin membership', async () => {
  const { service } = createServiceHarness({ actorRole: 'MEMBER' });

  await assert.rejects(
    () =>
      service.setGroupWorkState({ sub: 'actor-admin', role: 'MEMBER' }, 'group-1', {
        status: 'ing',
      }),
    ForbiddenException,
  );
});
