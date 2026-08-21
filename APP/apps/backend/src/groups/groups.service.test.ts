import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupAdminDiscoveryService } from './group-admin-discovery.service';
import { GroupChannelService } from './group-channel.service';
import { GroupMembershipService } from './group-membership.service';
import { GroupPresenter } from './group-presenter.service';
import { GroupQueryService } from './group-query.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { GroupsService } from './groups.service';

test('groups service is a thin facade over split group services', () => {
  assert.equal(typeof GroupQueryService, 'function');
  assert.equal(typeof GroupMembershipService, 'function');
  assert.equal(typeof GroupAdminDiscoveryService, 'function');
  assert.equal(typeof GroupChannelService, 'function');
  assert.equal(typeof GroupPresenter, 'function');
  assert.equal(typeof GroupRealtimePublisher, 'function');
});

function makeGroupsService(
  overrides: {
    queryService?: Partial<GroupQueryService>;
    presenter?: Partial<GroupPresenter>;
    groupRealtimePublisher?: Partial<GroupRealtimePublisher>;
    channelService?: Partial<GroupChannelService>;
  } = {},
) {
  return new GroupsService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    overrides.queryService as any,
    {} as any,
    {} as any,
    overrides.presenter as any,
    overrides.channelService as any,
    overrides.groupRealtimePublisher as any,
  );
}

test('advanceReadCursor publishes a dedicated realtime event only after a real advance', async () => {
  const published: unknown[][] = [];
  const service = makeGroupsService({
    queryService: {
      advanceReadCursor: async () => ({
        groupId: 'group-1',
        lastReadEventSequence: '42',
        changed: true,
      }),
    },
    groupRealtimePublisher: {
      publishReadCursorChanged: async (...args: unknown[]) => {
        published.push(args);
      },
    },
  });

  const result = await service.advanceReadCursor('user-1', 'group-1', 42n);

  assert.equal(result.changed, true);
  assert.deepEqual(published, [
    ['group-1', { userId: 'user-1', lastReadEventSequence: '42' }],
  ]);
});

test('markGroupRead validates membership with correct argument order and emits receipt update', async () => {
  const calls: {
    getGroup: Array<[string, string]>;
    updateMany: Array<unknown>;
    emitGroupUpdated: Array<unknown[]>;
  } = {
    getGroup: [],
    updateMany: [],
    emitGroupUpdated: [],
  };

  const service = makeGroupsService({
    queryService: {
      markGroupRead: async (userId: string, groupId: string) => {
        calls.getGroup.push([userId, groupId]);
        calls.updateMany.push({
          where: { groupId, userId },
          data: { lastReadEventSequence: 42n },
        });
      },
    },
    groupRealtimePublisher: {
      publishGroupUpdated: async (...args: unknown[]) => {
        calls.emitGroupUpdated.push(args);
      },
    },
  });

  await service.markGroupRead('user-1', 'group-1');

  assert.deepEqual(calls.getGroup, [['user-1', 'group-1']]);
  assert.equal(calls.updateMany.length, 1);
  assert.deepEqual(calls.emitGroupUpdated, [
    ['group-1', { actorUserId: 'user-1', reason: 'read_receipt_updated' }],
  ]);
});
