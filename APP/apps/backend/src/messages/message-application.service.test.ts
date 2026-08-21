import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageType } from '@prisma/client';
import { MessageApplicationService } from './message-application.service';

function createMessage() {
  return {
    id: 'message-1',
    groupId: 'group-1',
    senderId: 'user-1',
    eventSequence: 12n,
    type: MessageType.TEXT,
    text: 'hello bot',
    attachmentFileId: null,
    mentionedUserIds: ['bot-1'],
    replyToMessageId: null,
    revokedAt: null,
    editedAt: null,
    createdAt: new Date('2026-05-01T00:00:00.000Z'),
    sender: {
      id: 'user-1',
      email: 'user-1@example.com',
      displayName: 'User 1',
      avatarStorageKey: null,
    },
    attachmentFile: null,
    replyToMessage: null,
  };
}

test('MessageApplicationService delivers persisted messages to realtime and bot consumers', async () => {
  const calls: string[] = [];
  const eventCalls: Array<{ actorUserId: string; messageText: string }> = [];
  const receiptMembers = [
    {
      userId: 'bot-1',
      email: 'bot@example.com',
      displayName: 'Bot',
      avatarStorageKey: null,
      lastReadEventSequence: 12n,
      isBot: true,
    },
  ];
  const group = {
    id: 'group-1',
    isDM: false,
    members: [
      {
        userId: 'user-1',
        user: { email: 'user-1@example.com', displayName: 'User 1', role: 'MEMBER', isBot: false },
      },
      {
        userId: 'bot-1',
        user: { email: 'bot@example.com', displayName: 'Bot', role: 'CLI_BOT', isBot: true },
      },
    ],
  };
  const message = createMessage();

  const service = new MessageApplicationService(
    {
      listMessageReceiptMembers: async () => receiptMembers,
    } as never,
    {
      serializeMessage: () => ({ id: message.id, type: 'text', replyTo: null }),
    } as never,
    {
      publishCreated: async (groupId: string, eventId: bigint) => {
        calls.push(`realtime:${groupId}:${eventId.toString()}`);
      },
    } as never,
    {
      publishUserMessageCreated: async (input: { actorUserId: string; text?: string }) => {
        calls.push(`event:${Boolean(input.text)}`);
        eventCalls.push({ actorUserId: input.actorUserId, messageText: input.text ?? '' });
      },
    } as never,
  );

  await service.deliverUserMessageCreated({
    eventId: '018f1170-6a20-7ad5-88c4-54f14c895e31',
    group,
    message,
  } as never);

  assert.deepEqual(calls, ['realtime:group-1:12', 'event:true']);
  assert.deepEqual(eventCalls, [{ actorUserId: 'user-1', messageText: 'hello bot' }]);
});
