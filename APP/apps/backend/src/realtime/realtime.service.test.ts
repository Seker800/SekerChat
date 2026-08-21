import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebSocket } from 'ws';
import { ConnectionAuthenticator } from './connection-authenticator.service';
import { ConnectionRegistry } from './connection-registry.service';
import { GroupAudienceResolver } from './group-audience-resolver.service';
import { RealtimeEventPublisher } from './realtime-event-publisher.service';
import { RealtimeService } from './realtime.service';
import { WsServerAdapter } from './ws-server-adapter.service';
import { PresenceCoordinator } from './presence-coordinator.service';

function makeContext(
  userId: string,
  overrides?: Partial<{
    email: string;
    displayName: string | null;
    authKind: 'browser' | 'reminder';
    isAlive: boolean;
    dndUntil: Date | null;
  }>,
) {
  return {
    userId,
    email: overrides?.email ?? `${userId}@example.com`,
    displayName: overrides?.displayName ?? null,
    authKind: overrides?.authKind ?? 'browser',
    isAlive: overrides?.isAlive ?? true,
    dndUntil: overrides?.dndUntil ?? null,
    heartbeatTimeout: null,
  };
}

function makeBaseService(overrides?: {
  prismaOverrides?: any;
  reminderDeviceAuthOverrides?: any;
  authUserOverrides?: any;
}) {
  const prismaService = {
    user: {
      findUnique: async () => ({
        id: 'user-1',
        email: 'member@example.com',
        displayName: 'member',
        role: 'MEMBER',
        isBot: false,
        disabledAt: null,
      }),
    },
    groupMember: {
      findMany: async () => [{ userId: 'user-1' }, { userId: 'user-2' }],
    },
    reminderDeviceToken: {
      findFirst: async () => null,
      update: async () => undefined,
    },
    ...overrides?.prismaOverrides,
  };

  const jwtService = {
    verifyAsync: async () => ({
      sub: 'user-1',
      email: 'member@example.com',
      displayName: 'member',
      role: 'MEMBER',
    }),
  };

  const configService = {
    getOrThrow: (key: string) => {
      if (key === 'APP_BASE_URL') return 'https://im.example.com';
      if (key === 'JWT_ACCESS_SECRET') return 'test-secret';
      throw new Error(`unexpected key ${key}`);
    },
  };

  const authUserService = {
    resolveValidatedUser: async (payload: any) => payload,
    ...overrides?.authUserOverrides,
  };

  const presenceLogService = {
    log: async () => undefined,
  };

  const reminderDeviceAuthService = {
    consumeRealtimeTicket: async () => {
      throw new Error('unexpected reminder ticket');
    },
    authenticateDeviceToken: async () => {
      throw new Error('unexpected reminder device token');
    },
    ...overrides?.reminderDeviceAuthOverrides,
  };
  const registry = new ConnectionRegistry();
  const authenticator = new ConnectionAuthenticator(
    prismaService as any,
    jwtService as any,
    configService as any,
    authUserService as any,
    reminderDeviceAuthService as any,
  );
  const audienceResolver = new GroupAudienceResolver(prismaService as any);
  const eventPublisher = new RealtimeEventPublisher(registry, audienceResolver);
  const wsServerAdapter = new WsServerAdapter(registry);
  const presenceCoordinator = new PresenceCoordinator(
    registry,
    presenceLogService as any,
    eventPublisher,
  );

  return new RealtimeService(
    registry,
    authenticator,
    audienceResolver,
    eventPublisher,
    wsServerAdapter,
    presenceCoordinator,
  );
}

test('authenticateConnection accepts one-time reminder tickets and ignores legacy deviceToken queries', async () => {
  let consumedTicket = '';
  let longTokenCalls = 0;
  const service = makeBaseService({
    reminderDeviceAuthOverrides: {
      consumeRealtimeTicket: async (ticket: string) => {
        consumedTicket = ticket;
        return {
          deviceTokenId: 'device-1',
          userId: 'user-1',
          email: 'member@example.com',
          displayName: 'Member',
          dndUntil: null,
        };
      },
      authenticateDeviceToken: async () => {
        longTokenCalls += 1;
        throw new Error('legacy query must not be used');
      },
    },
  });

  const result = await (service as any).authenticateConnection(
    undefined,
    'im.example.com',
    '/realtime?ticket=one-time-ticket',
  );
  assert.equal(consumedTicket, 'one-time-ticket');
  assert.equal(result.authKind, 'reminder');
  assert.equal(result.reminderDeviceTokenId, 'device-1');

  await assert.rejects(
    () =>
      (service as any).authenticateConnection(
        undefined,
        'im.example.com',
        '/realtime?deviceToken=long-lived-secret',
      ),
    /Missing realtime auth token/,
  );
  assert.equal(longTokenCalls, 0);
});

test('replayed or expired reminder tickets close the WebSocket with 4401', async () => {
  const service = makeBaseService({
    reminderDeviceAuthOverrides: {
      consumeRealtimeTicket: async () => {
        throw new Error('Invalid realtime ticket.');
      },
    },
  });
  const closed: Array<{ code: number; reason: string }> = [];
  const socket = {
    close: (code: number, reason: string) => closed.push({ code, reason }),
    on: () => undefined,
  };

  await (service as any).handleConnection(
    socket,
    undefined,
    'im.example.com',
    '/realtime?ticket=replayed-ticket',
    undefined,
  );

  assert.deepEqual(closed, [{ code: 4401, reason: 'Unauthorized' }]);
});

test('authenticateConnection revalidates browser users through AuthUserService', async () => {
  let resolveValidatedUserCalled = false;

  const service = makeBaseService({
    authUserOverrides: {
      resolveValidatedUser: async (payload: any) => {
        resolveValidatedUserCalled = true;
        return payload;
      },
    },
  });

  const result = await (service as any).authenticateConnection(
    'sekerchat_access=browser-token',
    'im.example.com',
    '/realtime',
  );

  assert.equal(resolveValidatedUserCalled, true);
  assert.equal(result.userId, 'user-1');
  assert.equal(result.authKind, 'browser');
});

test('authenticateConnection rejects users who must change a temporary password', async () => {
  const service = makeBaseService({
    authUserOverrides: {
      resolveValidatedUser: async (payload: any) => ({
        ...payload,
        mustChangePassword: true,
      }),
    },
  });

  await assert.rejects(
    () =>
      (service as any).authenticateConnection(
        'sekerchat_access=browser-token',
        'im.example.com',
        '/realtime',
      ),
    /Password change required/,
  );
});

test('addClient maintains userIdIndex for single connection', () => {
  const service = makeBaseService();

  const socket = {} as WebSocket;
  const context = makeContext('user-1', { email: 'a@b.com' });

  (service as any).addClient(socket, context);

  assert.equal((service as any).clients.size, 1);
  assert.equal((service as any).userIdIndex.size, 1);
  assert.ok((service as any).userIdIndex.get('user-1')?.has(socket));
});

test('addClient adds multiple connections under the same userId', () => {
  const service = makeBaseService();

  const socket1 = {} as WebSocket;
  const socket2 = {} as WebSocket;
  const context = makeContext('user-1', { email: 'a@b.com' });

  (service as any).addClient(socket1, context);
  (service as any).addClient(socket2, { ...context });

  assert.equal((service as any).clients.size, 2);
  assert.equal((service as any).userIdIndex.size, 1);
  assert.equal((service as any).userIdIndex.get('user-1')?.size, 2);
});

test('removeClient cleans up userIdIndex when last socket is removed', () => {
  const service = makeBaseService();

  const socket = {} as WebSocket;
  const context = makeContext('user-1', { email: 'a@b.com' });

  (service as any).addClient(socket, context);
  (service as any).removeClient(socket);

  assert.equal((service as any).clients.size, 0);
  assert.equal((service as any).userIdIndex.size, 0);
});

test('removeClient keeps userIdIndex entry when other sockets remain', () => {
  const service = makeBaseService();

  const socket1 = {} as WebSocket;
  const socket2 = {} as WebSocket;
  const context = makeContext('user-1', { email: 'a@b.com' });

  (service as any).addClient(socket1, context);
  (service as any).addClient(socket2, { ...context });
  (service as any).removeClient(socket1);

  assert.equal((service as any).clients.size, 1);
  assert.equal((service as any).userIdIndex.size, 1);
  assert.equal((service as any).userIdIndex.get('user-1')?.size, 1);
});

test('getOnlineUserIds returns userIds with at least one connected socket', () => {
  const service = makeBaseService();

  const socket1 = {} as WebSocket;
  const socket2 = {} as WebSocket;
  (service as any).addClient(socket1, makeContext('user-1', { email: 'a@b.com' }));
  (service as any).addClient(socket2, makeContext('user-2', { email: 'c@d.com' }));

  const online = service.getOnlineUserIds();

  assert.equal(online.size, 2);
  assert.ok(online.has('user-1'));
  assert.ok(online.has('user-2'));
});

test('getBrowserOnlineUserIds excludes reminder-only connections', () => {
  const service = makeBaseService();

  const browserSocket = {} as WebSocket;
  const reminderSocket = {} as WebSocket;
  (service as any).addClient(browserSocket, makeContext('user-1', { authKind: 'browser' }));
  (service as any).addClient(reminderSocket, makeContext('user-2', { authKind: 'reminder' }));

  const online = service.getBrowserOnlineUserIds();

  assert.equal(online.size, 1);
  assert.ok(online.has('user-1'));
  assert.equal(online.has('user-2'), false);
});

test('getOnlineUserIds excludes user after all their sockets removed', () => {
  const service = makeBaseService();

  const socket = {} as WebSocket;
  const context = makeContext('user-1', { email: 'a@b.com' });
  (service as any).addClient(socket, context);
  (service as any).removeClient(socket);

  const online = service.getOnlineUserIds();

  assert.equal(online.size, 0);
});

test('groupMemberCache caches member ids and respects TTL', async () => {
  let findManyCalls = 0;
  const service = makeBaseService({
    prismaOverrides: {
      groupMember: {
        findMany: async () => {
          findManyCalls++;
          return [{ userId: 'user-1' }, { userId: 'user-2' }];
        },
      },
    },
  });

  // First call populates cache
  const result1 = await (service as any).getGroupMemberIds('group-1');
  assert.equal(findManyCalls, 1);
  assert.equal(result1.size, 2);

  // Second call hits cache
  const result2 = await (service as any).getGroupMemberIds('group-1');
  assert.equal(findManyCalls, 1);
  assert.equal(result2.size, 2);
});

test('groupMemberCache invalidated by invalidateGroupMemberCache', async () => {
  let findManyCalls = 0;
  const service = makeBaseService({
    prismaOverrides: {
      groupMember: {
        findMany: async () => {
          findManyCalls++;
          return [{ userId: 'user-1' }];
        },
      },
    },
  });

  await (service as any).getGroupMemberIds('group-1');
  assert.equal(findManyCalls, 1);

  service.invalidateGroupMemberCache('group-1');

  await (service as any).getGroupMemberIds('group-1');
  assert.equal(findManyCalls, 2);
});

test('broadcastDndChanged updates dndUntil for all sockets of target user via index', () => {
  const service = makeBaseService();

  const socket1 = {} as WebSocket;
  const socket2 = {} as WebSocket;
  const context = makeContext('user-1', { email: 'a@b.com' });
  (service as any).addClient(socket1, context);
  (service as any).addClient(socket2, { ...context });

  const dndUntil = new Date('2026-06-01T00:00:00.000Z');
  service.broadcastDndChanged('user-1', dndUntil);

  assert.equal((service as any).clients.get(socket1)?.dndUntil, dndUntil);
  assert.equal((service as any).clients.get(socket2)?.dndUntil, dndUntil);
});

test('broadcastDndChanged writes a presence snapshot when browser user is online', async () => {
  const logs: Array<{ userId: string; event: string; isOnline?: boolean; isDnd?: boolean }> = [];
  const service = makeBaseService();
  (service as any).presenceCoordinator.presenceLogService = {
    log: async (
      userId: string,
      _email: string,
      event: string,
      options?: { isOnline?: boolean; isDnd?: boolean },
    ) => {
      logs.push({ userId, event, isOnline: options?.isOnline, isDnd: options?.isDnd });
    },
  };

  const socket = {} as WebSocket;
  (service as any).addClient(
    socket,
    makeContext('user-1', { email: 'user-1@example.com', authKind: 'browser' }),
  );
  service.broadcastDndChanged('user-1', new Date('9999-12-31T23:59:59.999Z'));

  await Promise.resolve();

  assert.deepEqual(logs, [{ userId: 'user-1', event: 'dnd_on', isOnline: true, isDnd: true }]);
});

test('emitToGroupMembers sends only to allowed group members via userIdIndex', async () => {
  const sentMessages: { userId: string; payload: string }[] = [];
  function makeSocket() {
    return { readyState: WebSocket.OPEN, send: (data: string) => null } as unknown as WebSocket;
  }

  const service = makeBaseService({
    prismaOverrides: {
      groupMember: {
        findMany: async () => [{ userId: 'user-1' }, { userId: 'user-2' }],
      },
    },
  });

  const socket1 = makeSocket();
  const socket2 = makeSocket();
  const socket3 = makeSocket();

  // Override send to capture messages
  socket1.send = (data: string) => {
    sentMessages.push({ userId: 'user-1', payload: data });
  };
  socket2.send = (data: string) => {
    sentMessages.push({ userId: 'user-2', payload: data });
  };
  socket3.send = (data: string) => {
    sentMessages.push({ userId: 'user-3', payload: data });
  };

  (service as any).addClient(socket1, makeContext('user-1', { email: 'a@b.com' }));
  (service as any).addClient(socket2, makeContext('user-2', { email: 'c@d.com' }));
  (service as any).addClient(socket3, makeContext('user-3', { email: 'e@f.com' }));

  // Attach a fake server so emitToGroupMembers doesn't short-circuit
  (service as any).webSocketServer = {};

  await (service as any).emitToGroupMembers('group-1', {
    eventVersion: 1,
    eventId: 'evt-1',
    type: 'message.created.v1',
    groupId: 'group-1',
    occurredAt: new Date().toISOString(),
    payload: {
      id: 'message-1',
      groupId: 'group-1',
      senderId: 'user-1',
      type: 'text',
      mentionedUserIds: [],
    },
  });

  assert.equal(sentMessages.length, 2);
  assert.ok(sentMessages.some((m) => m.userId === 'user-1'));
  assert.ok(sentMessages.some((m) => m.userId === 'user-2'));
  assert.ok(sentMessages.every((m) => m.userId !== 'user-3'));
});

test('emitToGroupMembers respects includeUserIds and excludeUserIds', async () => {
  const sentMessages: { userId: string }[] = [];
  function makeSocket() {
    return { readyState: WebSocket.OPEN, send: (_data: string) => null } as unknown as WebSocket;
  }

  const service = makeBaseService({
    prismaOverrides: {
      groupMember: {
        findMany: async () => [{ userId: 'user-1' }],
      },
    },
  });

  const socket1 = makeSocket();
  socket1.send = () => {
    sentMessages.push({ userId: 'user-1' });
  };
  const socket2 = makeSocket();
  socket2.send = () => {
    sentMessages.push({ userId: 'user-2' });
  };

  (service as any).addClient(socket1, makeContext('user-1', { email: 'a@b.com' }));
  (service as any).addClient(socket2, makeContext('user-2', { email: 'c@d.com' }));
  (service as any).webSocketServer = {};

  // user-2 is included even though not a member; user-1 is excluded
  await (service as any).emitToGroupMembers(
    'group-1',
    {
      eventVersion: 1,
      eventId: 'evt-1',
      type: 'message.created.v1',
      groupId: 'group-1',
      occurredAt: new Date().toISOString(),
      payload: {
        id: 'message-1',
        groupId: 'group-1',
        senderId: 'user-1',
        type: 'text',
        mentionedUserIds: [],
      },
    },
    { includeUserIds: ['user-2'], excludeUserIds: ['user-1'] },
  );

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0]!.userId, 'user-2');
});

test('emitToGroupMembers skips users not currently online', async () => {
  const sentMessages: string[] = [];
  function makeSocket() {
    return {
      readyState: WebSocket.OPEN,
      send: (data: string) => {
        sentMessages.push(data);
      },
    } as unknown as WebSocket;
  }

  const service = makeBaseService({
    prismaOverrides: {
      groupMember: {
        findMany: async () => [{ userId: 'user-1' }, { userId: 'user-2' }],
      },
    },
  });

  // Only user-1 is online (in userIdIndex)
  (service as any).addClient(makeSocket(), makeContext('user-1', { email: 'a@b.com' }));
  // user-2 is a member but NOT online
  (service as any).webSocketServer = {};

  await (service as any).emitToGroupMembers('group-1', {
    eventVersion: 1,
    eventId: 'evt-1',
    type: 'message.created.v1',
    groupId: 'group-1',
    occurredAt: new Date().toISOString(),
    payload: {
      id: 'message-1',
      groupId: 'group-1',
      senderId: 'user-1',
      type: 'text',
      mentionedUserIds: [],
    },
  });

  assert.equal(sentMessages.length, 1);
});

test('connectClient logs and broadcasts online only for the first socket of a user', async () => {
  const logs: Array<{ userId: string; event: string; isOnline?: boolean; isDnd?: boolean }> = [];
  const service = makeBaseService();
  (service as any).presenceCoordinator.presenceLogService = {
    log: async (
      userId: string,
      _email: string,
      event: string,
      options?: { isOnline?: boolean; isDnd?: boolean },
    ) => {
      logs.push({ userId, event, isOnline: options?.isOnline, isDnd: options?.isDnd });
    },
  };

  const broadcasts: Array<{ userId: string; online: boolean }> = [];
  (service as any).presenceCoordinator.publishPresence = (userId: string, online: boolean) => {
    broadcasts.push({ userId, online });
  };

  const socket1 = { readyState: WebSocket.OPEN } as WebSocket;
  const socket2 = { readyState: WebSocket.OPEN } as WebSocket;
  (service as any).connectClient(socket1, makeContext('user-1'));
  (service as any).connectClient(socket2, makeContext('user-1'));

  await Promise.resolve();

  assert.deepEqual(logs, [{ userId: 'user-1', event: 'online', isOnline: true, isDnd: false }]);
  assert.deepEqual(broadcasts, [{ userId: 'user-1', online: true }]);
});

test('connectClient does not log browser presence for reminder-only sockets', async () => {
  const logs: Array<{ userId: string; event: string }> = [];
  const service = makeBaseService();
  (service as any).presenceCoordinator.presenceLogService = {
    log: async (userId: string, _email: string, event: string) => {
      logs.push({ userId, event });
    },
  };

  const broadcasts: Array<{ userId: string; online: boolean }> = [];
  (service as any).presenceCoordinator.publishPresence = (userId: string, online: boolean) => {
    broadcasts.push({ userId, online });
  };

  const socket = { readyState: WebSocket.OPEN } as WebSocket;
  (service as any).connectClient(socket, makeContext('user-1', { authKind: 'reminder' }));

  await Promise.resolve();

  assert.deepEqual(logs, []);
  assert.deepEqual(broadcasts, []);
});

test('disconnectUserSessions terminates every active connection for the user', () => {
  let terminated = 0;
  const service = makeBaseService();
  const makeSocket = () =>
    ({
      readyState: WebSocket.OPEN,
      send: () => undefined,
      terminate: () => {
        terminated += 1;
      },
    }) as unknown as WebSocket;
  const firstSocket = makeSocket();
  const secondSocket = makeSocket();
  const otherSocket = makeSocket();
  (service as any).addClient(firstSocket, makeContext('user-1'));
  (service as any).addClient(secondSocket, makeContext('user-1', { authKind: 'reminder' }));
  (service as any).addClient(otherSocket, makeContext('user-2'));

  const disconnected = service.disconnectUserSessions('user-1');

  assert.equal(disconnected, 2);
  assert.equal(terminated, 2);
  assert.equal((service as any).userIdIndex.has('user-1'), false);
  assert.equal((service as any).userIdIndex.has('user-2'), true);
});

test('disconnectClient keeps user online while another socket remains', async () => {
  const logs: Array<{ userId: string; event: string }> = [];
  const service = makeBaseService();
  (service as any).presenceCoordinator.presenceLogService = {
    log: async (userId: string, _email: string, event: string) => {
      logs.push({ userId, event });
    },
  };

  const broadcasts: Array<{ userId: string; online: boolean }> = [];
  (service as any).presenceCoordinator.publishPresence = (userId: string, online: boolean) => {
    broadcasts.push({ userId, online });
  };

  const socket1 = { readyState: WebSocket.OPEN } as WebSocket;
  const socket2 = { readyState: WebSocket.OPEN } as WebSocket;
  (service as any).connectClient(socket1, makeContext('user-1'));
  (service as any).connectClient(socket2, makeContext('user-1'));

  logs.length = 0;
  broadcasts.length = 0;

  (service as any).disconnectClient(socket1);
  await Promise.resolve();

  assert.equal((service as any).userIdIndex.get('user-1')?.size, 1);
  assert.deepEqual(logs, []);
  assert.deepEqual(broadcasts, []);
});

test('disconnectClient logs and broadcasts offline when last socket disconnects', async () => {
  const logs: Array<{ userId: string; event: string; isOnline?: boolean; isDnd?: boolean }> = [];
  const service = makeBaseService();
  (service as any).presenceCoordinator.presenceLogService = {
    log: async (
      userId: string,
      _email: string,
      event: string,
      options?: { isOnline?: boolean; isDnd?: boolean },
    ) => {
      logs.push({ userId, event, isOnline: options?.isOnline, isDnd: options?.isDnd });
    },
  };

  const broadcasts: Array<{ userId: string; online: boolean }> = [];
  (service as any).presenceCoordinator.publishPresence = (userId: string, online: boolean) => {
    broadcasts.push({ userId, online });
  };

  const socket = { readyState: WebSocket.OPEN } as WebSocket;
  (service as any).connectClient(socket, makeContext('user-1'));

  logs.length = 0;
  broadcasts.length = 0;

  (service as any).disconnectClient(socket);
  await Promise.resolve();

  assert.equal((service as any).userIdIndex.size, 0);
  assert.deepEqual(logs, [{ userId: 'user-1', event: 'offline', isOnline: false, isDnd: false }]);
  assert.deepEqual(broadcasts, [{ userId: 'user-1', online: false }]);
});

test('disconnectClient ignores reminder socket when browser socket remains absent', async () => {
  const logs: Array<{ userId: string; event: string }> = [];
  const service = makeBaseService();
  (service as any).presenceCoordinator.presenceLogService = {
    log: async (userId: string, _email: string, event: string) => {
      logs.push({ userId, event });
    },
  };

  const broadcasts: Array<{ userId: string; online: boolean }> = [];
  (service as any).presenceCoordinator.publishPresence = (userId: string, online: boolean) => {
    broadcasts.push({ userId, online });
  };

  const socket = { readyState: WebSocket.OPEN } as WebSocket;
  (service as any).connectClient(socket, makeContext('user-1', { authKind: 'reminder' }));

  logs.length = 0;
  broadcasts.length = 0;

  (service as any).disconnectClient(socket);
  await Promise.resolve();

  assert.deepEqual(logs, []);
  assert.deepEqual(broadcasts, []);
});

test('scheduleHeartbeatTimeout terminates stale socket and clears user presence', async () => {
  const logs: Array<{ userId: string; event: string; isOnline?: boolean; isDnd?: boolean }> = [];
  const service = makeBaseService();
  (service as any).presenceCoordinator.presenceLogService = {
    log: async (
      userId: string,
      _email: string,
      event: string,
      options?: { isOnline?: boolean; isDnd?: boolean },
    ) => {
      logs.push({ userId, event, isOnline: options?.isOnline, isDnd: options?.isDnd });
    },
  };

  const broadcasts: Array<{ userId: string; online: boolean }> = [];
  (service as any).presenceCoordinator.publishPresence = (userId: string, online: boolean) => {
    broadcasts.push({ userId, online });
  };

  let terminated = 0;
  const socket = {
    readyState: WebSocket.OPEN,
    terminate: () => {
      terminated += 1;
    },
  } as unknown as WebSocket;
  const context = makeContext('user-1');
  (service as any).connectClient(socket, context);

  logs.length = 0;
  broadcasts.length = 0;

  (service as any).scheduleHeartbeatTimeout(socket, context);
  await new Promise((resolve) => setTimeout(resolve, 11_000));

  assert.equal(terminated, 1);
  assert.equal((service as any).clients.size, 0);
  assert.deepEqual(logs, [{ userId: 'user-1', event: 'offline', isOnline: false, isDnd: false }]);
  assert.deepEqual(broadcasts, [{ userId: 'user-1', online: false }]);
});
