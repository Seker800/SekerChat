import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CurrentUserResponse } from '../../lib/auth-api';
import { useWorkspaceShellModel } from './useWorkspaceShellModel';

const mockNavigate = vi.fn();
const mockRefetchInvitableUsers = vi.fn().mockResolvedValue(undefined);
const mockUseWorkspaceQueries = vi.fn();

vi.mock('@sekerchat/shared', () => ({
  hasSystemPermission: () => true,
}));

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

vi.mock('../../store/workspace-store', () => ({
  DM_ATTENDANCE_PAGE_ID: '__dm_attendance__',
  useWorkspaceStore: () => ({
    setReplyToMessageId: vi.fn(),
    setWorkspaceMode: vi.fn(),
    unhideDm: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ groupId: 'group-1', dmId: '' }),
  };
});

vi.mock('./useWorkspaceDialogs', () => ({
  useWorkspaceDialogs: () => ({
    isStartDMDialogOpen: false,
    setIsStartDMDialogOpen: vi.fn(),
    pushNotice: vi.fn(),
    createChannelInServerName: '',
    createChannelName: '',
    createServerName: '',
    renameServerName: '',
    serverDialogState: null,
    setCreateChannelInServerName: vi.fn(),
    setCreateChannelName: vi.fn(),
    setCreateServerName: vi.fn(),
    setIsCreateChannelDialogOpen: vi.fn(),
    setServerDialogState: vi.fn(),
    memberDialogUserId: '',
    closeMemberDialog: vi.fn(),
    setIsChannelDialogOpen: vi.fn(),
    setConfirmDialog: vi.fn(),
    confirmDialogModel: null,
    setConfirmDialogModel: vi.fn(),
    closeAuxSidebar: vi.fn(),
    closeMobileSidebar: vi.fn(),
    channelDialog: {},
    userSettingsDialog: {},
    notice: null,
    openMemberDialog: vi.fn(),
    openServerCreateDialog: vi.fn(),
    openServerSettingsDialog: vi.fn(),
    openUserSettings: vi.fn(),
    showCopiedNotice: vi.fn(),
    showInfoNotice: vi.fn(),
    showErrorNotice: vi.fn(),
    setCreateChannelDialogOpen: vi.fn(),
    isCreateChannelDialogOpen: false,
    setCreateChannelInServerDialogOpen: vi.fn(),
  }),
}));

vi.mock('./useWorkspaceQueries', () => ({
  useWorkspaceQueries: (...args: unknown[]) => mockUseWorkspaceQueries(...args),
}));

vi.mock('./useServerCategories', () => ({
  DEFAULT_CATEGORY: '未分类',
  buildCategoryStats: () => null,
  useServerCategories: () => ({
    activeChannels: [],
    archivedCategoryGroups: [],
    archivedCategoryRailItems: [],
    categoryGroups: [],
    categoryNames: [],
    categoryRailItems: [],
    selectedCategoryName: '未分类',
  }),
}));

vi.mock('./useWorkspaceNavigation', () => ({
  useWorkspaceNavigation: () => ({
    closeAuxSidebar: vi.fn(),
    closeMobileSidebar: vi.fn(),
    navigateToGroup: vi.fn(),
    openAuxSidebar: vi.fn(),
    openMobileSidebar: vi.fn(),
  }),
}));

vi.mock('./useMessageList', () => ({
  useMessageList: () => ({
    messagesQuery: { refetch: vi.fn() },
    messages: [],
    olderMessagesCursor: null,
    isLoadingOlderMessages: false,
    loadOlderMessages: vi.fn(),
    patchLoadedMessage: vi.fn(),
    handleVisibleLatestMessage: vi.fn(),
  }),
}));

vi.mock('./useComposer', () => ({
  useComposer: () => ({
    composer: {
      onSeedMention: vi.fn(),
    },
    replyToMessageId: '',
    pendingUploads: [],
    clearPendingError: vi.fn(),
    retryPendingUpload: vi.fn(),
  }),
}));

vi.mock('./useManagePanel', () => ({
  useManagePanel: () => ({
    manage: {
      onRemoveMember: vi.fn(),
    },
  }),
}));

vi.mock('./useDmActions', () => ({
  useDmActions: () => ({
    startDMWithUser: vi.fn(),
    onDMStarted: vi.fn(),
  }),
}));

vi.mock('./useArtifacts', () => ({
  useArtifacts: () => ({
    artifacts: [],
  }),
}));

vi.mock('./useWorkspaceMutations', () => ({
  useWorkspaceMutations: () => ({
    archiveGroupMutation: { mutateAsync: vi.fn() },
    onEditMessage: vi.fn(),
    onRevokeMessage: vi.fn(),
    onChangeCategory: vi.fn(),
    onSetWorkStatus: vi.fn(),
    serverDialogState: {
      isSubmitting: false,
      onSubmitCreate: vi.fn(),
      onSubmitRename: vi.fn(),
    },
    createChannelDialogState: {
      isSubmitting: false,
      onSubmit: vi.fn(),
    },
  }),
}));

const currentUser: CurrentUserResponse = {
  id: 'user-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  avatarUrl: null,
  role: 'ADMIN',
  dndUntil: null,
  createdAt: '2026-05-01T00:00:00.000Z',
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe('useWorkspaceShellModel invitable users loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefetchInvitableUsers.mockResolvedValue(undefined);
    mockUseWorkspaceQueries.mockImplementation(
      ({ shouldLoadInvitableUsers }: { shouldLoadInvitableUsers: boolean }) => ({
        allUsersQuery: {
          data: [],
          error: null,
          isLoading: false,
          isFetching: false,
          refetch: mockRefetchInvitableUsers,
        },
        artifactsQuery: { data: [], refetch: vi.fn() },
        channels: [],
        channelsQuery: { refetch: vi.fn() },
        dmCandidatesQuery: { data: [], isLoading: false, isFetching: false },
        dms: [],
        dmsQuery: { isLoading: false, isError: false, refetch: vi.fn() },
        dmUnreadCount: 0,
        invitableUsers: [],
        requestedGroupId: 'group-1',
        selectedGroup: {
          id: 'group-1',
          name: 'General',
          members: [],
          memberCount: 0,
          archivedAt: null,
        },
        selectedGroupId: 'group-1',
        selectedGroupQuery: { refetch: vi.fn() },
        servers: [],
        serversQuery: { isLoading: false, isError: false, refetch: vi.fn() },
        workStateQuery: { data: null, refetch: vi.fn() },
        workspaceBootstrapQuery: {
          data: null,
          dataUpdatedAt: 0,
        },
        shouldLoadInvitableUsersSeen: shouldLoadInvitableUsers,
      }),
    );
  });

  it('enables invitable users loading on first request', async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceShellModel({
          accessToken: 'token',
          currentUser,
          mode: 'server',
          rolePermissions: {} as never,
        }),
      {
        wrapper: createWrapper(),
      },
    );

    expect(mockUseWorkspaceQueries.mock.lastCall?.[0].shouldLoadInvitableUsers).toBe(false);

    result.current.requestInvitableUsers();

    await waitFor(() => {
      expect(mockUseWorkspaceQueries.mock.lastCall?.[0].shouldLoadInvitableUsers).toBe(true);
    });
    expect(mockRefetchInvitableUsers).not.toHaveBeenCalled();
  });

  it('refetches invitable users when refreshing after a failure', async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceShellModel({
          accessToken: 'token',
          currentUser,
          mode: 'server',
          rolePermissions: {} as never,
        }),
      {
        wrapper: createWrapper(),
      },
    );

    result.current.requestInvitableUsers();

    await waitFor(() => {
      expect(mockUseWorkspaceQueries.mock.lastCall?.[0].shouldLoadInvitableUsers).toBe(true);
    });

    result.current.refreshInvitableUsers();

    await waitFor(() => {
      expect(mockRefetchInvitableUsers).toHaveBeenCalledTimes(1);
    });
  });

  it('refetches when requestInvitableUsers is called again after the initial load', async () => {
    const { result } = renderHook(
      () =>
        useWorkspaceShellModel({
          accessToken: 'token',
          currentUser,
          mode: 'server',
          rolePermissions: {} as never,
        }),
      {
        wrapper: createWrapper(),
      },
    );

    result.current.requestInvitableUsers();

    await waitFor(() => {
      expect(mockUseWorkspaceQueries.mock.lastCall?.[0].shouldLoadInvitableUsers).toBe(true);
    });

    result.current.requestInvitableUsers();

    await waitFor(() => {
      expect(mockRefetchInvitableUsers).toHaveBeenCalledTimes(1);
    });
  });
});
