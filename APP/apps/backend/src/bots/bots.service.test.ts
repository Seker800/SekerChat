import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { test } from 'node:test';
import { BotsService } from './bots.service';

test('createBot always produces an agent bot', async () => {
  const service = new BotsService(
    {
      user: {
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: 'bot-1',
          email: data.email,
          displayName: data.displayName,
          avatarStorageKey: null,
          role: data.role,
          isBot: data.isBot,
          botConfig: data.botConfig,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
        findUniqueOrThrow: async () => ({
          id: 'bot-1',
          email: 'openclaw@example.com',
          displayName: 'OpenClaw',
          avatarStorageKey: null,
          role: 'CLI_BOT',
          isBot: true,
          botConfig: { chatEnabled: true, openclawAgentId: 'main' },
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
        }),
      },
    } as any,
    {} as any,
    {} as any,
  );

  const result = await service.createBot({
    email: 'openclaw@example.com',
    displayName: 'OpenClaw',
    botConfig: { chatEnabled: true, openclawAgentId: 'main' },
  });

  assert.equal(result.kind, 'AGENT_BOT');
  assert.equal(result.role, 'CLI_BOT');
  assert.equal(result.isBot, true);
});

test('listPublicChatBots never exposes private bot configuration', async () => {
  const service = new BotsService(
    {
      user: {
        findMany: async () => [
          {
            id: 'bot-1',
            email: 'openclaw@example.com',
            displayName: 'OpenClaw',
            avatarStorageKey: null,
            role: 'CLI_BOT',
            isBot: true,
            botConfig: {
              gatewayUrl: 'http://127.0.0.1:18789',
              authToken: 'private-gateway-token',
              allowedUserIds: ['user-1'],
              systemPrompt: 'private system prompt',
            },
            createdAt: new Date('2026-05-01T00:00:00.000Z'),
          },
        ],
      },
    } as any,
    {} as any,
    {} as any,
  );

  const [bot] = await service.listPublicChatBots();

  assert.equal(bot?.id, 'bot-1');
  assert.equal(bot?.kind, 'AGENT_BOT');
  assert.equal('botConfig' in (bot ?? {}), false);
});

test('handleIncomingMessage ignores bots with chat disabled', async () => {
  const service = new BotsService(
    {
      user: {
        findFirst: async () => ({
          id: 'bot-1',
          displayName: 'OpenClaw',
          role: 'CLI_BOT',
          botConfig: { chatEnabled: false },
        }),
      },
      message: {
        findMany: async () => [],
      },
    } as any,
    {
      createMessage: async () => {
        throw new Error('should not send a reply');
      },
    } as any,
    {} as any,
  );

  await service.handleIncomingMessage(
    'bot-1',
    'group-1',
    'user-1',
    'User 1',
    'hello',
    '018f1170-6a20-7ad5-88c4-54f14c895e31',
  );
  assert.ok(true);
});

test('handleIncomingMessage ignores legacy member-role chat bots', async () => {
  const service = new BotsService(
    {
      user: {
        findFirst: async () => null,
      },
    } as any,
    {
      createMessage: async () => {
        throw new Error('should not send a reply');
      },
    } as any,
    {} as any,
  );

  await service.handleIncomingMessage(
    'legacy-chat-bot',
    'group-1',
    'user-1',
    'User 1',
    'hello',
    '018f1170-6a20-7ad5-88c4-54f14c895e31',
  );
  assert.ok(true);
});

test('outbox retry reuses a generated bot reply without calling OpenClaw twice', async () => {
  let fetchCalls = 0;
  let messageCalls = 0;
  let deliveryState: 'NONE' | 'CLAIMED' | 'GENERATED' | 'COMPLETED' = 'NONE';
  let generatedReply = '';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ choices: [{ message: { content: 'durable reply' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const service = new BotsService(
    {
      user: {
        findFirst: async () => ({
          id: 'bot-1',
          displayName: 'OpenClaw',
          role: 'CLI_BOT',
          isBot: true,
          botConfig: {
            chatEnabled: true,
            authToken: 'secret',
            gatewayUrl: 'http://127.0.0.1:18789',
            openclawAgentId: 'main',
          },
        }),
      },
      message: { findMany: async () => [] },
    } as any,
    {
      createMessage: async () => {
        messageCalls += 1;
        if (messageCalls === 1) throw new Error('database temporarily unavailable');
      },
    } as any,
    {
      claim: async () => {
        if (deliveryState === 'NONE') {
          deliveryState = 'CLAIMED';
          return { state: 'ACQUIRED' };
        }
        if (deliveryState === 'GENERATED') {
          return { state: 'GENERATED', responseText: generatedReply };
        }
        return { state: 'TERMINAL' };
      },
      storeGenerated: async (_botUserId: string, _sourceEventId: string, reply: string) => {
        generatedReply = reply;
        deliveryState = 'GENERATED';
      },
      markCompleted: async () => {
        deliveryState = 'COMPLETED';
      },
      markAmbiguous: async () => undefined,
    } as any,
  );

  try {
    await assert.rejects(
      () =>
        service.handleIncomingMessage(
          'bot-1',
          'group-1',
          'user-1',
          'User 1',
          'hello',
          '018f1170-6a20-7ad5-88c4-54f14c895e31',
        ),
      /database temporarily unavailable/,
    );
    await service.handleIncomingMessage(
      'bot-1',
      'group-1',
      'user-1',
      'User 1',
      'hello',
      '018f1170-6a20-7ad5-88c4-54f14c895e31',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(fetchCalls, 1);
  assert.equal(messageCalls, 2);
});

test('createBot rejects non-whitelisted gateway URLs', async () => {
  const service = new BotsService(
    {
      user: {
        findUnique: async () => {
          throw new Error('should not reach prisma');
        },
      },
    } as any,
    {} as any,
    {} as any,
  );

  await assert.rejects(
    () =>
      service.createBot({
        email: 'openclaw@example.com',
        displayName: 'OpenClaw',
        botConfig: { gatewayUrl: 'http://127.0.0.1:3000/api/admin' },
      }),
    (error: unknown) =>
      error instanceof BadRequestException && /approved OpenClaw endpoint/.test(error.message),
  );
});
