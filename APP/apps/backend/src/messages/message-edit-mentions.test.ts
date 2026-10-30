import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { MessageType } from '@prisma/client';
import { MessagesService } from './messages.service';

for (const [text, expected] of [
  ['请 @同事', ['u2']],
  ['移除提及', []],
  ['@陌生人', []],
  ['@same@a.test', ['email-a']],
] as const) {
  test(`editing recomputes persisted mentions for ${text}`, async () => {
    const oldMessage = {
      id: 'm1',
      groupId: 'g1',
      senderId: 'u1',
      type: MessageType.TEXT,
      revokedAt: null,
      mentionedUserIds: ['old-member'],
    };
    const tx = {
      message: { update: async ({ data }: { data: object }) => ({ ...oldMessage, ...data }) },
    };
    const published: unknown[] = [];
    const service = new MessagesService(
      {
        group: {
          findFirst: async () => ({
            id: 'g1',
            archivedAt: null,
            isDM: false,
            members: [
              {
                userId: 'email-label',
                user: { email: 'different@c.test', displayName: 'same@a.test' },
              },
              { userId: 'email-a', user: { email: 'same@a.test', displayName: '重名' } },
              { userId: 'email-b', user: { email: 'same@b.test', displayName: '重名' } },
              { userId: 'u2', user: { email: 'colleague@example.test', displayName: '同事' } },
            ],
          }),
        },
        message: { findFirst: async () => oldMessage },
        $transaction: async (callback: (transaction: typeof tx) => unknown) => callback(tx),
      } as never,
      {} as never,
      {
        publishUpdated: async (_g: string, _m: string, value: unknown) => published.push(value),
      } as never,
      {} as never,
      {} as never,
      { listMessageReceiptMembers: async () => [] } as never,
      { serializeMessage: async (value: unknown) => value } as never,
      {} as never,
      {} as never,
      { enqueue: async () => undefined } as never,
    );
    const result = await service.editMessage('u1', 'g1', 'm1', text);
    assert.deepEqual(result.mentionedUserIds, expected);
    assert.equal(published[0], result);
  });
}
