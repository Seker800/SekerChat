import '@testing-library/jest-dom/vitest';
import { DEFAULT_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT } from '@sekerchat/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceQueries } from './useWorkspaceQueries';

const listGroupsMock = vi.fn();
const listDMsMock = vi.fn();
const getGroupMock = vi.fn();
const fetchWorkspaceBootstrapMock = vi.fn();

vi.mock('../../lib/groups-api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/groups-api')>('../../lib/groups-api');
  return {
    ...actual,
    listGroups: (...args: unknown[]) => listGroupsMock(...args),
    getGroup: (...args: unknown[]) => getGroupMock(...args),
    listInvitableUsers: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../lib/dm-api', () => ({
  listDMs: (...args: unknown[]) => listDMsMock(...args),
  listDMCandidates: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/messages-files-api', () => ({
  listGroupArtifacts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../lib/ops-api', () => ({
  getGroupWorkState: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../lib/workspace-api', () => ({
  fetchWorkspaceBootstrap: (...args: unknown[]) => fetchWorkspaceBootstrapMock(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useWorkspaceQueries selection recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchWorkspaceBootstrapMock.mockRejectedValue(new Error('bootstrap unavailable'));
    listGroupsMock.mockResolvedValue([
      {
        id: 'group-1',
        name: 'General',
        category: '研发',
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
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        createdById: 'user-1',
        currentUserRole: 'ADMIN',
        unreadCount: 0,
        memberCount: 1,
        members: [],
      },
    ]);
    listDMsMock.mockResolvedValue([
      {
        id: 'dm-1',
        name: 'Alice',
        category: '',
        isDM: true,
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
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        createdById: 'user-1',
        currentUserRole: 'ADMIN',
        unreadCount: 0,
        memberCount: 2,
        members: [],
      },
    ]);
    getGroupMock.mockImplementation(async (_token: string, groupId: string) => ({
      id: groupId,
      name: groupId,
      category: groupId.startsWith('dm-') ? '' : '研发',
      isDM: groupId.startsWith('dm-'),
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
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      createdById: 'user-1',
      currentUserRole: 'ADMIN',
      unreadCount: 0,
      memberCount: 1,
      members: [],
    }));
  });

  it('falls back to the first visible server when the route group id is stale', async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceQueries({
          accessToken: 'token',
          canInviteMembers: false,
          shouldLoadInvitableUsers: false,
          isStartDMDialogOpen: false,
          mode: 'server',
          routeGroupId: 'missing-group',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.selectedGroupId).toBe('group-1');
    });
    expect(result.current.requestedGroupId).toBe('missing-group');
  });

  it('prefers an active server channel when the cached list starts with an archived channel', async () => {
    const [activeGroup] = await listGroupsMock();
    listGroupsMock.mockResolvedValue([
      {
        ...activeGroup,
        id: 'archived-group',
        name: 'Archived',
        archivedAt: '2026-05-02T00:00:00.000Z',
      },
      activeGroup,
    ]);

    const { result } = renderHook(
      () =>
        useWorkspaceQueries({
          accessToken: 'token',
          canInviteMembers: false,
          shouldLoadInvitableUsers: false,
          isStartDMDialogOpen: false,
          mode: 'server',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.selectedGroupId).toBe('group-1');
    });
  });

  it('keeps an explicitly requested archived server channel selected', async () => {
    const [activeGroup] = await listGroupsMock();
    listGroupsMock.mockResolvedValue([
      {
        ...activeGroup,
        id: 'archived-group',
        name: 'Archived',
        archivedAt: '2026-05-02T00:00:00.000Z',
      },
      activeGroup,
    ]);

    const { result } = renderHook(
      () =>
        useWorkspaceQueries({
          accessToken: 'token',
          canInviteMembers: false,
          shouldLoadInvitableUsers: false,
          isStartDMDialogOpen: false,
          mode: 'server',
          routeGroupId: 'archived-group',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.selectedGroupId).toBe('archived-group');
    });
  });

  it('falls back to the first visible dm when the route dm id is stale', async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceQueries({
          accessToken: 'token',
          canInviteMembers: false,
          shouldLoadInvitableUsers: false,
          isStartDMDialogOpen: false,
          mode: 'dm',
          routeDmId: 'missing-dm',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.selectedGroupId).toBe('dm-1');
    });
    expect(result.current.requestedGroupId).toBe('missing-dm');
  });

  it('uses the list response as selected group cache without an immediate detail request', async () => {
    getGroupMock.mockClear();
    const { result } = renderHook(
      () =>
        useWorkspaceQueries({
          accessToken: 'token',
          canInviteMembers: false,
          shouldLoadInvitableUsers: false,
          isStartDMDialogOpen: false,
          mode: 'server',
          routeGroupId: 'group-1',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.selectedGroup?.id).toBe('group-1');
    });

    expect(getGroupMock).not.toHaveBeenCalled();
  });

  it('uses workspace bootstrap data before falling back to individual list requests', async () => {
    const bootstrapGroup = {
      id: 'group-bootstrap',
      name: 'Bootstrap',
      category: '研发',
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
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z',
      createdById: 'user-1',
      currentUserRole: 'ADMIN',
      unreadCount: 0,
      memberCount: 1,
      members: [],
    };
    fetchWorkspaceBootstrapMock.mockResolvedValue({
      mode: 'server',
      systemConfig: { rolePermissions: null },
      groups: [bootstrapGroup],
      dms: [],
      selectedGroupId: 'group-bootstrap',
      selectedGroup: bootstrapGroup,
      messages: { groupId: 'group-bootstrap', items: [] },
    });
    getGroupMock.mockClear();

    const { result } = renderHook(
      () =>
        useWorkspaceQueries({
          accessToken: 'token',
          canInviteMembers: false,
          shouldLoadInvitableUsers: false,
          isStartDMDialogOpen: false,
          mode: 'server',
          routeGroupId: 'group-bootstrap',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.selectedGroup?.id).toBe('group-bootstrap');
    });

    expect(fetchWorkspaceBootstrapMock).toHaveBeenCalledWith('token', {
      mode: 'server',
      groupId: 'group-bootstrap',
      dmId: undefined,
      messageLimit: DEFAULT_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT,
    });
    expect(listGroupsMock).not.toHaveBeenCalled();
    expect(listDMsMock).not.toHaveBeenCalled();
    expect(getGroupMock).not.toHaveBeenCalled();
  });

  it('waits for bootstrap before starting fallback list requests', async () => {
    let resolveBootstrap:
      | ((value: {
          mode: 'server';
          systemConfig: { rolePermissions: null };
          groups: Array<{
            id: string;
            name: string;
            category: string;
            isDM: boolean;
            latestMessage: null;
            serverAvatarUrl: null;
            workState: null;
            artifactConfirmation: {
              isConfirmed: boolean;
              confirmedAt: null;
              confirmedByUserId: null;
              confirmedByDisplayName: null;
            };
            archivedAt: null;
            createdAt: string;
            updatedAt: string;
            createdById: string;
            currentUserRole: string;
            unreadCount: number;
            memberCount: number;
            members: [];
          }>;
          dms: [];
          selectedGroupId: string;
          selectedGroup: {
            id: string;
            name: string;
            category: string;
            isDM: boolean;
            latestMessage: null;
            serverAvatarUrl: null;
            workState: null;
            artifactConfirmation: {
              isConfirmed: boolean;
              confirmedAt: null;
              confirmedByUserId: null;
              confirmedByDisplayName: null;
            };
            archivedAt: null;
            createdAt: string;
            updatedAt: string;
            createdById: string;
            currentUserRole: string;
            unreadCount: number;
            memberCount: number;
            members: [];
          };
          messages: { groupId: string; items: [] };
        }) => void)
      | undefined;
    fetchWorkspaceBootstrapMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveBootstrap = resolve;
        }),
    );

    renderHook(
      () =>
        useWorkspaceQueries({
          accessToken: 'token',
          canInviteMembers: false,
          shouldLoadInvitableUsers: false,
          isStartDMDialogOpen: false,
          mode: 'server',
          routeGroupId: 'group-bootstrap',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(fetchWorkspaceBootstrapMock).toHaveBeenCalledTimes(1);
    });
    expect(listGroupsMock).not.toHaveBeenCalled();
    expect(listDMsMock).not.toHaveBeenCalled();

    resolveBootstrap?.({
      mode: 'server',
      systemConfig: { rolePermissions: null },
      groups: [
        {
          id: 'group-bootstrap',
          name: 'Bootstrap',
          category: '研发',
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
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-05-01T00:00:00.000Z',
          createdById: 'user-1',
          currentUserRole: 'ADMIN',
          unreadCount: 0,
          memberCount: 1,
          members: [],
        },
      ],
      dms: [],
      selectedGroupId: 'group-bootstrap',
      selectedGroup: {
        id: 'group-bootstrap',
        name: 'Bootstrap',
        category: '研发',
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
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z',
        createdById: 'user-1',
        currentUserRole: 'ADMIN',
        unreadCount: 0,
        memberCount: 1,
        members: [],
      },
      messages: { groupId: 'group-bootstrap', items: [] },
    });

    await waitFor(() => {
      expect(listGroupsMock).not.toHaveBeenCalled();
      expect(listDMsMock).not.toHaveBeenCalled();
    });
  });

  it('clears the selected group id when the server list is empty and the route is stale', async () => {
    listGroupsMock.mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        useWorkspaceQueries({
          accessToken: 'token',
          canInviteMembers: false,
          shouldLoadInvitableUsers: false,
          isStartDMDialogOpen: false,
          mode: 'server',
          routeGroupId: 'missing-group',
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.serversQuery.isSuccess).toBe(true);
    });

    expect(result.current.selectedGroupId).toBe('');
    expect(getGroupMock).not.toHaveBeenCalled();
  });
});
