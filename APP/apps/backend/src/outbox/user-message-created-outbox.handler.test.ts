import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageType, OutboxEventStatus, type OutboxEvent } from '@prisma/client';
import { UserMessageCreatedOutboxHandler } from './user-message-created-outbox.handler';

test('user message outbox handler reloads committed state and delivers with the durable event id', async () => {
  const delivered: Array<{ eventId: string; messageId: string; groupId: string }> = [];
  const message = {
    id: 'message-1',
    groupId: 'group-1',
    senderId: 'user-1',
    eventSequence: 1n,
    type: MessageType.TEXT,
    text: 'hello',
    attachmentFileId: null,
    mentionedUserIds: [],
    replyToMessageId: null,
    revokedAt: null,
    editedAt: null,
    createdAt: new Date('2026-08-11T00:00:00.000Z'),
    sender: { id: 'user-1', email: 'user@example.com', displayName: 'User', avatarStorageKey: null },
    attachmentFile: null,
    replyToMessage: null,
  };
  const group = { id: 'group-1', isDM: false, members: [] };
  const handler = new UserMessageCreatedOutboxHandler(
    {
      message: { findUnique: async () => message },
      group: { findUnique: async () => group },
    } as never,
    {
      deliverUserMessageCreated: async (input: {
        eventId: string;
        message: { id: string };
        group: { id: string };
      }) => {
        delivered.push({
          eventId: input.eventId,
          messageId: input.message.id,
          groupId: input.group.id,
        });
      },
    } as never,
  );
  const event: OutboxEvent = {
    id: '018f1170-6a20-7ad5-88c4-54f14c895e31',
    eventType: 'message.user-created.v1',
    aggregateType: 'Message',
    aggregateId: 'message-1',
    payload: { messageId: 'message-1' },
    status: OutboxEventStatus.PROCESSING,
    attempts: 1,
    availableAt: new Date(),
    lockedAt: new Date(),
    processedAt: null,
    lastError: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await handler.handle(event);

  assert.deepEqual(delivered, [{
    eventId: event.id,
    messageId: 'message-1',
    groupId: 'group-1',
  }]);
});
