import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupAudienceResolver } from './group-audience-resolver.service';
import { ConnectionRegistry } from './connection-registry.service';
import { RealtimeEventPublisher } from './realtime-event-publisher.service';

test('mute suppresses reminder sockets only; browser messages and other members stay live, and unmute is immediate', async () => {
  let muted = false;
  let cutoff = 0n;
  const resolver = new GroupAudienceResolver({
    groupMember: {
      findMany: async ({
        where,
      }: {
        where: {
          notificationsMuted?: boolean;
          notificationsMutedThroughEventSequence?: { lt: bigint };
        };
      }) => {
        const users = [
          { userId: 'alice', notificationsMuted: muted },
          { userId: 'bob', notificationsMuted: false },
        ];
        return users.filter(
          (u) =>
            where.notificationsMuted === undefined ||
            (u.notificationsMuted === where.notificationsMuted &&
              (u.userId !== 'alice' || cutoff < where.notificationsMutedThroughEventSequence!.lt)),
        );
      },
    },
  } as never);
  const registry = new ConnectionRegistry();
  const sent: string[] = [];
  for (const [userId, authKind] of [
    ['alice', 'browser'],
    ['alice', 'reminder'],
    ['bob', 'reminder'],
  ]) {
    registry.add(
      { readyState: 1, send: () => sent.push(`${userId}:${authKind}`) } as never,
      { userId, authKind } as never,
    );
  }
  const publisher = new RealtimeEventPublisher(registry, resolver);
  const event = {
    eventVersion: 1,
    eventId: '1',
    type: 'message.created.v1',
    groupId: 'group',
    occurredAt: new Date().toISOString(),
    payload: {
      id: 'message-1',
      groupId: 'group',
      senderId: 'bob',
      type: 'text',
      mentionedUserIds: [],
    },
  } as const;
  await publisher.publishToGroup('group', event);
  assert.deepEqual(sent, ['alice:browser', 'alice:reminder', 'bob:reminder']);
  sent.length = 0;
  muted = true;
  await publisher.publishToGroup('group', event);
  assert.deepEqual(sent, ['alice:browser', 'bob:reminder']);
  sent.length = 0;
  muted = false;
  cutoff = 1n;
  await publisher.publishToGroup('group', event);
  assert.deepEqual(sent, ['alice:browser', 'bob:reminder']);
  sent.length = 0;
  await publisher.publishToGroup('group', { ...event, eventId: '2' });
  assert.deepEqual(sent, ['alice:browser', 'alice:reminder', 'bob:reminder']);
});
