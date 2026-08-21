import { describe, expect, it } from 'vitest';
import type { GroupResponse } from '../../lib/groups-api';
import { buildServerStats, getServerId } from './useServerCategories';

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
