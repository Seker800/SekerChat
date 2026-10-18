import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupNotificationsService } from './group-notifications.service';

test('notification settings lock and update only the authenticated member; unmute sets a durable alert cutoff and publication failure does not undo persistence', async () => {
  const writes: unknown[] = [];
  let current = false;
  const tx = {
    $queryRaw: async (_sql: unknown, groupId: string, userId: string) => {
      assert.equal(groupId, 'ordinary-group');
      assert.equal(userId, 'alice');
      return [{ notificationsMuted: current }];
    },
    message: { findFirst: async () => ({ eventSequence: 17n }) },
    groupMember: {
      update: async (input: { data: { notificationsMuted: boolean } }) => {
        writes.push(input);
        current = input.data.notificationsMuted;
      },
    },
  };
  const service = new GroupNotificationsService(
    { $transaction: async (fn: (value: unknown) => unknown) => fn(tx) } as never,
    {
      publishGroupUpdated: async () => {
        throw new Error('offline');
      },
    } as never,
  );
  assert.deepEqual(await service.update('alice', 'ordinary-group', true), {
    groupId: 'ordinary-group',
    notificationsMuted: true,
  });
  await service.update('alice', 'ordinary-group', false);
  await service.update('alice', 'ordinary-group', false);
  assert.deepEqual(writes, [
    {
      where: { groupId_userId: { groupId: 'ordinary-group', userId: 'alice' } },
      data: { notificationsMuted: true },
    },
    {
      where: { groupId_userId: { groupId: 'ordinary-group', userId: 'alice' } },
      data: { notificationsMuted: false, notificationsMutedThroughEventSequence: 17n },
    },
    {
      where: { groupId_userId: { groupId: 'ordinary-group', userId: 'alice' } },
      data: { notificationsMuted: false },
    },
  ]);
});

test('a non-member cannot set a group preference or broadcast a change', async () => {
  let broadcasts = 0;
  const service = new GroupNotificationsService(
    {
      $transaction: async (fn: (value: unknown) => unknown) => fn({ $queryRaw: async () => [] }),
    } as never,
    {
      publishGroupUpdated: async () => {
        broadcasts++;
      },
    } as never,
  );
  await assert.rejects(() => service.update('not-a-member', 'group', true), /只能设置自己/);
  assert.equal(broadcasts, 0);
});
