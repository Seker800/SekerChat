import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BotMessageDispatchService } from './bot-message-dispatch.service';
import { MessageEventsService } from '../messages/message-events.service';

test('BotMessageDispatchService dispatches dm bot reply targets after user messages', async () => {
  const calls: Array<{ botUserId: string; messageText: string }> = [];
  const events = new MessageEventsService();

  const service = new BotMessageDispatchService(
    {
      handleIncomingMessage: async (
        botUserId: string,
        _groupId: string,
        _fromUserId: string,
        _fromUserName: string,
        messageText: string,
      ) => {
        calls.push({ botUserId, messageText });
      },
    } as never,
    events,
    {
      listReplyTargets: async () => ['bot-1'],
    } as never,
  );
  service.onModuleInit();

  await events.publishUserMessageCreated({
    eventId: '018f1170-6a20-7ad5-88c4-54f14c895e31',
    group: {
      id: 'group-1',
      isDM: true,
      members: [
        {
          userId: 'user-1',
          user: { email: 'user-1@example.com', displayName: 'User 1', role: 'MEMBER', isBot: false },
        },
      ],
    },
    actorUserId: 'user-1',
    message: {} as never,
    text: 'hello bot',
    mentionedUserIds: [],
  });

  assert.deepEqual(calls, [{ botUserId: 'bot-1', messageText: 'hello bot' }]);
});

test('BotMessageDispatchService skips events without text', async () => {
  const calls: Array<unknown> = [];
  const events = new MessageEventsService();

  const service = new BotMessageDispatchService(
    {
      handleIncomingMessage: async (...args: unknown[]) => {
        calls.push(args);
      },
    } as never,
    events,
    {
      listReplyTargets: async () => ['bot-1'],
    } as never,
  );
  service.onModuleInit();

  await events.publishUserMessageCreated({
    eventId: '018f1170-6a20-7ad5-88c4-54f14c895e31',
    group: { id: 'group-1', isDM: true, members: [] },
    actorUserId: 'user-1',
    message: {} as never,
    text: undefined,
    mentionedUserIds: [],
  });

  assert.deepEqual(calls, []);
});
