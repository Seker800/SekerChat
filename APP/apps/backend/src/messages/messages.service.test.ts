import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessageType, Prisma } from '@prisma/client';
import { BotAccessService } from '../common/bot-access.service';
import { MessageApplicationService } from './message-application.service';
import { MessageEventsService } from './message-events.service';
import { MessageReadReceiptService } from './message-read-receipt.service';
import { MessageSerializerService } from './message-serializer.service';
import type { MessageReceiptMember } from './message-record.types';
import { MessagesService } from './messages.service';
import { SystemMessageService } from './system-message.service';
import { CreateMessageType } from './dto/create-message.dto';

function defaultReceiptMembers() {
  return [
    {
      userId: 'user-1',
      lastReadEventSequence: 999n,
      user: {
        email: 'user-1@example.com',
        displayName: 'User 1',
        avatarStorageKey: null,
        isBot: false,
      },
    },
  ];
}

function createService(deps: {
  prismaService: object;
  filesService: object;
  realtimeService: object;
  avatarsService: object;
  messageEventsService?: MessageEventsService;
  outboxWakeupService?: { notify: () => void };
}) {
  const readReceiptService = new MessageReadReceiptService(
    deps.prismaService as never,
    deps.avatarsService as never,
  );
  const serializerService = new MessageSerializerService(
    deps.filesService as never,
    deps.avatarsService as never,
    readReceiptService,
  );
  const applicationService = new MessageApplicationService(
    readReceiptService,
    serializerService,
    deps.realtimeService as never,
    deps.messageEventsService ?? new MessageEventsService(),
  );
  const systemMessageService = new SystemMessageService(
    deps.prismaService as never,
    readReceiptService,
    serializerService,
    deps.realtimeService as never,
  );

  return new MessagesService(
    deps.prismaService as never,
    deps.filesService as never,
    deps.realtimeService as never,
    applicationService,
    systemMessageService,
    readReceiptService,
    serializerService,
    new BotAccessService(deps.prismaService as never),
    (deps.outboxWakeupService ?? { notify: () => undefined }) as never,
  );
}

test('createMessage commits its outbox event without waiting for realtime delivery', async () => {
  const emittedRealtime: Array<{ groupId: string; eventId: bigint; payload: unknown }> = [];
  const outboxEvents: unknown[] = [];
  let wakeups = 0;

  const prismaService = {
    group: {
      findFirst: async () => ({
        id: 'group-1',
        archivedAt: null,
        isDM: false,
        members: [
          {
            userId: 'user-1',
            user: {
              email: 'user-1@example.com',
              displayName: 'User 1',
              role: 'MEMBER',
              isBot: false,
            },
          },
        ],
      }),
      update: async () => undefined,
    },
    groupMember: {
      findMany: async () => defaultReceiptMembers(),
      updateMany: async () => ({ count: 1 }),
    },
    $transaction: async <T>(input: unknown) => {
      if (typeof input === 'function') {
        return (input as (transaction: {
          message: { create: (payload: unknown) => Promise<T> };
          fileObject: { update: (payload: unknown) => Promise<void> };
          group: { update: (payload: unknown) => Promise<void> };
          groupMember: { updateMany: (payload: unknown) => Promise<void> };
          outboxEvent: { create: (payload: unknown) => Promise<void> };
        }) => Promise<T>)({
          message: {
            create: async () =>
              ({
                id: 'message-1',
                groupId: 'group-1',
                senderId: 'user-1',
                eventSequence: 42n,
                type: MessageType.TEXT,
                text: 'hello world',
                attachmentFileId: null,
                mentionedUserIds: [],
                replyToMessageId: null,
                createdAt: new Date('2026-04-09T08:00:00.000Z'),
                sender: {
                  id: 'user-1',
                  email: 'user-1@example.com',
                  displayName: 'User 1',
                },
                attachmentFile: null,
                replyToMessage: null,
              }) as T,
          },
          fileObject: {
            update: async () => undefined,
          },
          group: { update: async () => undefined },
          groupMember: { updateMany: async () => undefined },
          outboxEvent: { create: async (payload) => { outboxEvents.push(payload); } },
        });
      }
      return input;
    },
    user: {
      findUnique: async () => null,
    },
  };

  const filesService = {
    assertAttachmentUsable: async () => {
      throw new Error('attachment path should not be used for text messages');
    },
    createFileAccessUrl: () => 'unused',
  };

  const realtimeService = {
    emitMessageCreated: async (groupId: string, eventId: bigint, payload: unknown) => {
      emittedRealtime.push({ groupId, eventId, payload });
    },
  };
  const avatarsService = {
    buildUserAvatarUrl: () => null,
  };

  const service = createService({
    prismaService,
    filesService,
    realtimeService,
    avatarsService,
    outboxWakeupService: { notify: () => { wakeups += 1; } },
  });

  const result = await service.createMessage('user-1', 'group-1', {
    type: CreateMessageType.TEXT,
    text: 'hello world',
  });

  assert.equal(result.id, 'message-1');
  assert.equal(emittedRealtime.length, 0);
  assert.equal(outboxEvents.length, 1);
  assert.equal(wakeups, 1);
});

test('createMessage returns the serialized message for a second text input', async () => {
  const prismaService = {
    group: {
      findFirst: async () => ({
        id: 'group-1',
        archivedAt: null,
        isDM: false,
        members: [
          {
            userId: 'user-1',
            user: {
              email: 'user-1@example.com',
              displayName: 'User 1',
              role: 'MEMBER',
              isBot: false,
            },
          },
        ],
      }),
      update: async () => undefined,
    },
    groupMember: {
      findMany: async () => defaultReceiptMembers(),
      updateMany: async () => ({ count: 1 }),
    },
    $transaction: async <T>(input: unknown) => {
      if (typeof input === 'function') {
        return (input as (transaction: {
          message: { create: (payload: unknown) => Promise<T> };
          fileObject: { update: (payload: unknown) => Promise<void> };
          group: { update: (payload: unknown) => Promise<void> };
          groupMember: { updateMany: (payload: unknown) => Promise<void> };
          outboxEvent: { create: (payload: unknown) => Promise<void> };
        }) => Promise<T>)({
          message: {
            create: async () =>
              ({
                id: 'message-2',
                groupId: 'group-1',
                senderId: 'user-1',
                eventSequence: 43n,
                type: MessageType.TEXT,
                text: 'hello again',
                attachmentFileId: null,
                mentionedUserIds: [],
                replyToMessageId: null,
                createdAt: new Date('2026-04-10T08:00:00.000Z'),
                sender: {
                  id: 'user-1',
                  email: 'user-1@example.com',
                  displayName: 'User 1',
                },
                attachmentFile: null,
                replyToMessage: null,
              }) as T,
          },
          fileObject: {
            update: async () => undefined,
          },
          group: { update: async () => undefined },
          groupMember: { updateMany: async () => undefined },
          outboxEvent: { create: async () => undefined },
        });
      }
      return input;
    },
    user: {
      findUnique: async () => null,
    },
  };

  const filesService = {
    assertAttachmentUsable: async () => {
      throw new Error('attachment path should not be used for text messages');
    },
    createFileAccessUrl: () => 'unused',
  };

  const realtimeService = {
    emitMessageCreated: async () => undefined,
  };
  const avatarsService = {
    buildUserAvatarUrl: () => null,
  };

  const service = createService({
    prismaService,
    filesService,
    realtimeService,
    avatarsService,
  });

  const result = await service.createMessage('user-1', 'group-1', {
    type: CreateMessageType.TEXT,
    text: 'hello again',
  });

  assert.equal(result.id, 'message-2');
});

test('createMessage returns the existing message when clientMessageId wins a concurrent race', async () => {
  const existingMessage = {
    id: 'message-existing',
    groupId: 'group-1',
    senderId: 'user-1',
    eventSequence: 44n,
    type: MessageType.TEXT,
    text: 'only once',
    attachmentFileId: null,
    mentionedUserIds: [],
    replyToMessageId: null,
    revokedAt: null,
    editedAt: null,
    createdAt: new Date('2026-04-11T08:00:00.000Z'),
    sender: {
      id: 'user-1',
      email: 'user-1@example.com',
      displayName: 'User 1',
      avatarStorageKey: null,
    },
    attachmentFile: null,
    replyToMessage: null,
  };
  const prismaService = {
    group: {
      findFirst: async () => ({
        id: 'group-1',
        archivedAt: null,
        isDM: false,
        members: [{
          userId: 'user-1',
          user: {
            email: 'user-1@example.com',
            displayName: 'User 1',
            role: 'MEMBER',
            isBot: false,
          },
        }],
      }),
    },
    message: { findUnique: async () => existingMessage },
    $transaction: async () => {
      throw new Prisma.PrismaClientKnownRequestError('duplicate message key', {
        code: 'P2002',
        clientVersion: '6.19.3',
        meta: { target: ['senderId', 'clientMessageId'] },
      });
    },
  };
  const service = new MessagesService(
    prismaService as never,
    {} as never,
    {} as never,
    { serializeUserMessage: async () => ({ id: existingMessage.id, type: 'text', replyTo: null }) } as never,
    {} as never,
    {} as never,
    {} as never,
    { ensureTextMessageAccessAllowed: async () => undefined } as never,
    { notify: () => undefined } as never,
  );

  const result = await service.createMessage('user-1', 'group-1', {
    type: CreateMessageType.TEXT,
    text: 'only once',
    clientMessageId: '018f1170-6a20-7ad5-88c4-54f14c895e31',
  });

  assert.equal(result.id, 'message-existing');
});

test('createMessage rejects dm bot messages when the sender is outside the allowlist', async () => {
  const prismaService = {
    group: {
      findFirst: async () => ({
        id: 'group-3',
        archivedAt: null,
        isDM: true,
        members: [
          {
            userId: 'user-1',
            user: {
              email: 'user-1@example.com',
              displayName: 'User 1',
              role: 'MEMBER',
              isBot: false,
            },
          },
          {
            userId: 'bot-1',
            user: {
              email: 'openclaw@example.com',
              displayName: 'OpenClaw',
              role: 'CLI_BOT',
              isBot: true,
            },
          },
        ],
      }),
    },
    groupMember: {
      findMany: async () => [
        ...defaultReceiptMembers(),
        {
          userId: 'bot-1',
          lastReadEventSequence: 0n,
          user: {
            email: 'openclaw@example.com',
            displayName: 'OpenClaw',
            avatarStorageKey: null,
            isBot: true,
          },
        },
      ],
    },
    user: {
      findUnique: async () => ({ botConfig: { allowedUserIds: ['user-2'] }, isBot: true, role: 'CLI_BOT' }),
    },
    $transaction: async <T>(callback: (transaction: {
      message: { create: (input: unknown) => Promise<T> };
      fileObject: { update: (input: unknown) => Promise<void> };
    }) => Promise<T>) =>
      callback({
        message: {
          create: async () =>
            ({
              id: 'message-group-2',
              groupId: 'group-3',
              senderId: 'user-1',
              eventSequence: 46n,
              type: MessageType.TEXT,
              text: '@OpenClaw do this',
              attachmentFileId: null,
              mentionedUserIds: [],
              replyToMessageId: null,
              createdAt: new Date('2026-04-13T08:00:00.000Z'),
              sender: {
                id: 'user-1',
                email: 'user-1@example.com',
                displayName: 'User 1',
              },
              attachmentFile: null,
              replyToMessage: null,
            }) as T,
        },
        fileObject: { update: async () => undefined },
      }),
  };

  const service = createService({
    prismaService,
    filesService: {
      assertAttachmentUsable: async () => {
        throw new Error('attachment path should not be used for text messages');
      },
      createFileAccessUrl: () => 'unused',
    },
    realtimeService: {
      emitMessageCreated: async () => undefined,
    },
    avatarsService: {
      buildUserAvatarUrl: () => null,
    },
  });

  await assert.rejects(
    () =>
      service.createMessage('user-1', 'group-3', {
        type: CreateMessageType.TEXT,
        text: 'hello bot',
      }),
    /This bot is not available for this user/,
  );
});

test('listReminderEvents batch-fetches receipt members per unique group', async () => {
  const receiptCalls: string[] = [];
  const members1: MessageReceiptMember[] = [
    {
      userId: 'user-1',
      email: 'a@example.com',
      displayName: 'A',
      avatarStorageKey: null,
      lastReadEventSequence: 10n,
      isBot: false,
    },
  ];
  const members2: MessageReceiptMember[] = [
    {
      userId: 'user-2',
      email: 'b@example.com',
      displayName: 'B',
      avatarStorageKey: null,
      lastReadEventSequence: 20n,
      isBot: false,
    },
  ];

  const prismaService = {
    message: {
      findMany: async ({ where }: { where: { eventSequence: { gt: bigint } } }) => {
        // Return 3 messages: 2 from group-1, 1 from group-2
        if (where.eventSequence.gt === 0n) {
          return [
            {
              id: 'msg-1',
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
              createdAt: new Date('2026-05-01T08:00:00.000Z'),
              sender: { id: 'user-1', email: 'a@example.com', displayName: 'A', avatarStorageKey: null },
              attachmentFile: null,
              replyToMessage: null,
            },
            {
              id: 'msg-2',
              groupId: 'group-2',
              senderId: 'user-2',
              eventSequence: 2n,
              type: MessageType.TEXT,
              text: 'world',
              attachmentFileId: null,
              mentionedUserIds: [],
              replyToMessageId: null,
              revokedAt: null,
              editedAt: null,
              createdAt: new Date('2026-05-01T08:01:00.000Z'),
              sender: { id: 'user-2', email: 'b@example.com', displayName: 'B', avatarStorageKey: null },
              attachmentFile: null,
              replyToMessage: null,
            },
            {
              id: 'msg-3',
              groupId: 'group-1',
              senderId: 'user-1',
              eventSequence: 3n,
              type: MessageType.TEXT,
              text: 'again',
              attachmentFileId: null,
              mentionedUserIds: [],
              replyToMessageId: null,
              revokedAt: null,
              editedAt: null,
              createdAt: new Date('2026-05-01T08:02:00.000Z'),
              sender: { id: 'user-1', email: 'a@example.com', displayName: 'A', avatarStorageKey: null },
              attachmentFile: null,
              replyToMessage: null,
            },
          ];
        }
        return [];
      },
    },
    group: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    groupMember: {
      findMany: async () => [],
    },
    $transaction: async <T>(input: unknown) => {
      if (typeof input === 'function') return input({} as any);
      return input;
    },
    user: { findUnique: async () => null },
  };

  const filesService = {
    assertAttachmentUsable: async () => undefined,
    createFileAccessUrl: () => 'http://files.example.com/test',
  };

  const realtimeService = { emitMessageCreated: async () => undefined };

  const avatarsService = {
    buildUserAvatarUrl: () => null,
  };

  // Build a custom ReadReceiptService that tracks calls
  const readReceiptService = {
    listMessageReceiptMembers: async (groupId: string) => {
      receiptCalls.push(groupId);
      return groupId === 'group-1' ? members1 : members2;
    },
    buildReadReceipt: () => null,
  } as any;

  const serializerService = new MessageSerializerService(
    filesService as any,
    avatarsService as any,
    readReceiptService,
  );

  const applicationService = new MessageApplicationService(
    readReceiptService,
    serializerService,
    realtimeService as any,
    new MessageEventsService(),
  );

  const systemMessageService = new SystemMessageService(
    prismaService as any,
    readReceiptService,
    serializerService,
    realtimeService as any,
  );

  const service = new MessagesService(
    prismaService as any,
    filesService as any,
    realtimeService as any,
    applicationService,
    systemMessageService,
    readReceiptService,
    serializerService,
    new BotAccessService(prismaService as any),
    { notify: () => undefined } as any,
  );

  const result = await service.listReminderEvents('user-1', {});

  // Called once per unique group, not per message
  assert.deepEqual(receiptCalls.sort(), ['group-1', 'group-2']);
  assert.equal(receiptCalls.length, 2);
  assert.equal(result.events.length, 3);
});

test('serializeMessageForGroup uses pre-fetched receipt members when provided', async () => {
  const receiptCalls: string[] = [];
  const preFetched: MessageReceiptMember[] = [
    {
      userId: 'user-1',
      email: 'a@example.com',
      displayName: 'A',
      avatarStorageKey: null,
      lastReadEventSequence: 10n,
      isBot: false,
    },
  ];

  const readReceiptService = {
    listMessageReceiptMembers: async (groupId: string) => {
      receiptCalls.push(groupId);
      return [];
    },
    buildReadReceipt: () => null,
  } as any;

  const filesService = {
    assertAttachmentUsable: async () => undefined,
    createFileAccessUrl: () => 'http://files.example.com/test',
  };

  const avatarsService = {
    buildUserAvatarUrl: () => null,
  };

  const serializerService = new MessageSerializerService(
    filesService as any,
    avatarsService as any,
    readReceiptService,
  );

  const applicationService = new MessageApplicationService(
    readReceiptService,
    serializerService,
    { emitMessageCreated: async () => undefined } as any,
    new MessageEventsService(),
  );

  const service = new MessagesService(
    {} as any,
    filesService as any,
    {} as any,
    applicationService,
    {} as any,
    readReceiptService,
    serializerService,
    {} as any,
    { notify: () => undefined } as any,
  );

  const message = {
    id: 'msg-1',
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
    createdAt: new Date('2026-05-01T08:00:00.000Z'),
    sender: { id: 'user-1', email: 'a@example.com', displayName: 'A', avatarStorageKey: null },
    attachmentFile: null,
    replyToMessage: null,
  };

  await service.serializeMessageForGroup(message, preFetched);

  // Should NOT call readReceiptService when pre-fetched is provided
  assert.equal(receiptCalls.length, 0);
});

test('serializeMessageForGroup falls back to fetching receipt members when not provided', async () => {
  const receiptCalls: string[] = [];

  const readReceiptService = {
    listMessageReceiptMembers: async (groupId: string) => {
      receiptCalls.push(groupId);
      return [];
    },
    buildReadReceipt: () => null,
  } as any;

  const filesService = {
    assertAttachmentUsable: async () => undefined,
    createFileAccessUrl: () => 'http://files.example.com/test',
  };

  const avatarsService = {
    buildUserAvatarUrl: () => null,
  };

  const serializerService = new MessageSerializerService(
    filesService as any,
    avatarsService as any,
    readReceiptService,
  );

  const applicationService = new MessageApplicationService(
    readReceiptService,
    serializerService,
    { emitMessageCreated: async () => undefined } as any,
    new MessageEventsService(),
  );

  const service = new MessagesService(
    {} as any,
    filesService as any,
    {} as any,
    applicationService,
    {} as any,
    readReceiptService,
    serializerService,
    {} as any,
    { notify: () => undefined } as any,
  );

  const message = {
    id: 'msg-1',
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
    createdAt: new Date('2026-05-01T08:00:00.000Z'),
    sender: { id: 'user-1', email: 'a@example.com', displayName: 'A', avatarStorageKey: null },
    attachmentFile: null,
    replyToMessage: null,
  };

  await service.serializeMessageForGroup(message);

  // Should call readReceiptService when no pre-fetched data
  assert.equal(receiptCalls.length, 1);
  assert.equal(receiptCalls[0], 'group-1');
});
