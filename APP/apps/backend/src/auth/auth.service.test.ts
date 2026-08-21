import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthService } from './auth.service';
import { CapabilitiesService } from '../system-config/capabilities.service';
import { CurrentUserService } from '../users/current-user.service';

test('auth service exposes app base url from config', () => {
  const service = new AuthService(
    {
      getOrThrow: () => 'http://localhost:5173',
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  assert.equal(service.getAppBaseUrl(), 'http://localhost:5173');
});

test('capabilities service does not advertise task.delete for CLI bots', async () => {
  const service = new CapabilitiesService(
    {
      user: {
        findUnique: async () => ({
          id: 'cli-bot-1',
          email: 'cli@example.com',
          displayName: 'CLI Bot',
          role: 'CLI_BOT',
          isBot: false,
        }),
      },
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        CLI_BOT: [
          'create_group',
          'manage_work_status',
          'archive_group',
        ],
        ADMIN: [],
        SUPER_ADMIN: [],
      }),
    } as any,
  );

  const result = await service.getCapabilities('cli-bot-1');
  assert.equal(result.allowedCommands.includes('task.delete'), false);
});

test('current user and capabilities services expose AGENT_BOT actorType for cli-role chat bots', async () => {
  const currentUserService = new CurrentUserService(
    {
      user: {
        findUnique: async () => ({
          id: 'agent-bot-1',
          email: 'openclaw@example.com',
          displayName: 'OpenClaw',
          role: 'CLI_BOT',
          isBot: true,
          avatarStorageKey: null,
          createdAt: new Date('2026-05-01T00:00:00.000Z'),
          dndUntil: null,
        }),
      },
    } as any,
    {
      buildUserAvatarUrl: () => null,
    } as any,
    {} as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        CLI_BOT: ['create_group'],
        ADMIN: [],
        SUPER_ADMIN: [],
      }),
    } as any,
  );
  const capabilitiesService = new CapabilitiesService(
    {
      user: {
        findUnique: async () => ({
          id: 'agent-bot-1',
          email: 'openclaw@example.com',
          displayName: 'OpenClaw',
          role: 'CLI_BOT',
          isBot: true,
        }),
      },
    } as any,
    {
      getRolePermissions: async () => ({
        MEMBER: [],
        CLI_BOT: ['create_group'],
        ADMIN: [],
        SUPER_ADMIN: [],
      }),
    } as any,
  );

  const currentUser = await currentUserService.getCurrentUser('agent-bot-1');
  const capabilities = await capabilitiesService.getCapabilities('agent-bot-1');

  assert.equal(currentUser.actorType, 'AGENT_BOT');
  assert.equal(capabilities.actorType, 'AGENT_BOT');
});
