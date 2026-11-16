import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GroupResponse, ServerResponse } from '../../lib/groups-api';
import {
  buildServerStats,
  getServerId,
  resolveServerLandingGroup,
  useServerTree,
} from './useServerTree';

function group(overrides: Partial<GroupResponse>): GroupResponse {
  return {
    id: 'group-1',
    name: 'general',
    category: '旧名称',
    serverId: 'server-1',
    server: {
      id: 'server-1',
      name: '新名称',
      avatarUrl: null,
      archivedAt: null,
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    },
    isDM: false,
    latestMessage: null,
    serverAvatarUrl: null,
    workState: null,
    artifactConfirmation: {
      isConfirmed: false,
      confirmedAt: null,
      confirmedByUserId: null,
      confirmedByDisplayName: null,
    },
    archivedAt: null,
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
    createdById: 'user-1',
    currentUserRole: 'ADMIN',
    unreadCount: 0,
    members: [],
    ...overrides,
  };
}

describe('server identity helpers', () => {
  it('keeps the same identity when the server display name changes', () => {
    const before = group({ server: { ...group({}).server!, name: '旧名称' } });
    const after = group({ server: { ...group({}).server!, name: '新名称' } });

    expect(getServerId(before)).toBe('server-1');
    expect(getServerId(after)).toBe('server-1');
    expect(buildServerStats([after], 'server-1')).toMatchObject({
      serverId: 'server-1',
      name: '新名称',
      groupCount: 1,
    });
  });

  it('uses an explicit legacy namespace during the compatibility window', () => {
    expect(getServerId(group({ serverId: null, server: null, category: '旧分组' }))).toBe(
      'legacy:旧分组',
    );
  });
});

function buildGroup(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    name: 'General',
    category: '研发',
    serverId: 'server-1',
    server: {
      id: 'server-1',
      name: '研发',
      avatarUrl: null,
      archivedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    serverAvatarUrl: null,
    categoryArchivedAt: null,
    archivedAt: null,
    unreadCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    members: [{ userId: 'user-1' }],
    ...overrides,
  } as unknown as GroupResponse;
}

function buildServer(overrides: Record<string, unknown> = {}) {
  return {
    id: 'server-1',
    name: '研发',
    avatarUrl: null,
    archivedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    isMember: true,
    ...overrides,
  } as unknown as ServerResponse;
}

describe('useServerTree server directory', () => {
  it('splits joined, unjoined and archived servers for full-access users', () => {
    const joinedGroup = buildGroup();
    const { result } = renderHook(() =>
      useServerTree({
        groups: [joinedGroup],
        selectedGroup: joinedGroup,
        servers: [joinedGroup],
        serverDirectory: [
          buildServer(),
          buildServer({ id: 'server-2', name: '外部项目', isMember: false }),
          buildServer({
            id: 'server-3',
            name: '旧项目',
            isMember: false,
            archivedAt: '2026-02-01T00:00:00.000Z',
          }),
        ],
        canAccessAllChannels: true,
      }),
    );

    expect(result.current.serverRailItems.map((item) => item.id)).toEqual(['server-1']);
    expect(result.current.unjoinedServerRailItems.map((item) => item.id)).toEqual(['server-2']);
    expect(result.current.archivedServerRailItems.map((item) => item.id)).toEqual(['server-3']);
  });

  it('ignores the server directory for users without full workspace access', () => {
    const joinedGroup = buildGroup();
    const { result } = renderHook(() =>
      useServerTree({
        groups: [joinedGroup],
        selectedGroup: joinedGroup,
        servers: [joinedGroup],
        serverDirectory: [buildServer({ id: 'server-2', name: '外部项目', isMember: false })],
        canAccessAllChannels: false,
      }),
    );

    expect(result.current.serverRailItems.map((item) => item.id)).toEqual(['server-1']);
    expect(result.current.unjoinedServerRailItems).toEqual([]);
  });
});

describe('resolveServerLandingGroup', () => {
  it('prefers the most recently updated active channel', () => {
    const landing = resolveServerLandingGroup(
      [
        buildGroup({ id: 'archived', archivedAt: '2026-02-01T00:00:00.000Z' }),
        buildGroup({ id: 'older', updatedAt: '2026-01-01T00:00:00.000Z' }),
        buildGroup({ id: 'newer', updatedAt: '2026-03-01T00:00:00.000Z' }),
      ],
      'server-1',
    );

    expect(landing?.id).toBe('newer');
  });
});
