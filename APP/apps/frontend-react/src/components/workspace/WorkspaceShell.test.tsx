import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthContext';
import type { CurrentUserResponse } from '../../lib/auth-api';
import type { GroupResponse } from '../../lib/groups-api';
import { DM_ATTENDANCE_ROUTE, DM_SUBSCRIPTION_ROUTE } from '../../store/workspace-store';
import { WorkspaceShell } from './WorkspaceShell';

const mockUseWorkspaceShellModel = vi.fn();
const mockUseNotification = vi.fn(() => ({
  handleMessageCreated: undefined,
  handleRealtimeRecovered: undefined,
}));
const mockUseRealtime = vi.fn();
const mockFetchSystemConfig = vi.fn();
const mockNavigate = vi.fn();
const mockResetOwnCheckInTodayForDev = vi.fn();
const mockChannelSidebar = vi.fn();

vi.mock('../../lib/system-config-api', () => ({
  fetchSystemConfig: (...args: unknown[]) => mockFetchSystemConfig(...args),
}));

vi.mock('../../lib/attendance-api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/attendance-api')>(
    '../../lib/attendance-api',
  );
  return {
    ...actual,
    resetOwnCheckInTodayForDev: (...args: unknown[]) => mockResetOwnCheckInTodayForDev(...args),
  };
});

vi.mock('../../hooks/useNotification', () => ({
  useNotification: () => mockUseNotification(),
}));

vi.mock('../../hooks/useRealtime', () => ({
  useRealtime: () => mockUseRealtime(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('./useWorkspaceShellModel', async () => {
  const actual = await vi.importActual<typeof import('./useWorkspaceShellModel')>(
    './useWorkspaceShellModel',
  );
  return {
    ...actual,
    useWorkspaceShellModel: () => mockUseWorkspaceShellModel(),
  };
});

vi.mock('./ServerRail', () => ({
  ServerRail: (props: { onOpenDM: () => void; onSelect: (serverId: string) => void }) => (
    <>
      <button data-testid="server-rail" onClick={() => props.onSelect('server-2')}>
        server-rail
      </button>
      <button data-testid="open-dm" onClick={() => props.onOpenDM()}>
        open-dm
      </button>
    </>
  ),
}));

vi.mock('./ChannelSidebar', () => ({
  ChannelSidebar: (props: unknown) => {
    mockChannelSidebar(props);
    return <div data-testid="channel-sidebar" />;
  },
}));

const mockMessagePane = vi.fn((_props?: unknown) => <div data-testid="message-pane" />);

vi.mock('./MessagePane', () => ({
  MessagePane: (props: unknown) => mockMessagePane(props),
}));

vi.mock('./Composer', () => ({
  Composer: () => <div data-testid="composer" />,
}));

vi.mock('./RightSidebar', () => ({
  RightSidebar: () => <div data-testid="right-sidebar" />,
}));

vi.mock('./DmSubscriptionPage', () => ({
  DmSubscriptionPage: () => <div data-testid="subscription-page" />,
  DmSubscriptionSidebar: () => <div data-testid="subscription-info-sidebar" />,
}));

vi.mock('./DmAttendancePage', () => ({
  DmAttendancePage: () => <div data-testid="attendance-page" />,
  DmAttendanceSidebar: () => <div data-testid="attendance-info-sidebar" />,
}));

vi.mock('./StartDMDialog', () => ({
  StartDMDialog: () => null,
}));

vi.mock('./WorkspaceDialogs', () => ({
  WorkspaceDialogs: () => null,
}));

const baseCurrentUser: CurrentUserResponse = {
  id: 'user-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  avatarUrl: null,
  role: 'ADMIN',
  dndUntil: null,
  createdAt: '2026-05-01T00:00:00.000Z',
};

const baseGroup: GroupResponse = {
  id: 'group-1',
  name: 'General',
  category: '研发',
  serverId: 'server-1',
  server: {
    id: 'server-1',
    name: '研发',
    avatarUrl: null,
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
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
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  createdById: 'user-1',
  currentUserRole: 'ADMIN',
  unreadCount: 0,
  memberCount: 1,
  members: [],
};

function createModel(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'server',
    selectedGroupId: 'missing-group',
    requestedGroupId: 'missing-group',
    selectedGroup: undefined,
    selectedGroupQuery: { isFetching: false, refetch: vi.fn() },
    groupsQuery: { error: null, refetch: vi.fn() },
    loadError: null,
    retryLoadError: vi.fn(),
    isLoading: false,
    isServerGroupsLoading: false,
    groups: [baseGroup],
    activeGroups: [baseGroup],
    categoryGroups: [baseGroup],
    archivedCategoryGroups: [],
    categoryRailItems: [],
    categoryNames: ['研发'],
    selectedCategoryName: '研发',
    dmUnreadCount: 0,
    servers: [baseGroup],
    isNarrowViewport: false,
    isMobileSidebarOpen: false,
    isSecondarySurfaceViewport: false,
    isAuxSidebarOpen: false,
    header: {
      channelName: 'General',
      channelMeta: '研发 · 1 人 · 可协作',
      userLabel: 'owner@example.com',
    },
    messages: [],
    artifacts: [],
    invitableUsers: [],
    isInvitableUsersLoading: false,
    isInvitableUsersRefreshing: false,
    invitableUsersError: null,
    replyToMessageId: '',
    notice: null,
    dmCandidatesCount: 0,
    isDMCandidatesLoading: false,
    pendingUploads: [],
    clearPendingError: vi.fn(),
    retryPendingUpload: vi.fn(),
    navigateToGroup: vi.fn(),
    refreshServerList: vi.fn(),
    closeMobileSidebar: vi.fn(),
    closeAuxSidebar: vi.fn(),
    openMobileSidebar: vi.fn(),
    openInfoSidebar: vi.fn(),
    openServerCreateDialog: vi.fn(),
    openServerSettingsDialog: vi.fn(),
    openChannelSettings: vi.fn(),
    openInviteMembers: vi.fn(),
    openStatusEditor: vi.fn(),
    onSetWorkStatus: vi.fn(),
    onChangeCategory: vi.fn(),
    requestArchiveGroup: vi.fn(),
    openUserSettings: vi.fn(),
    onStartNewDM: vi.fn(),
    onCreateNewChannel: vi.fn(),
    onVisibleLatestMessage: vi.fn(),
    loadOlderMessages: vi.fn(),
    hasMoreOlderMessages: false,
    isLoadingOlderMessages: false,
    onEditMessage: vi.fn(),
    onRevokeMessage: vi.fn(),
    showInfoNotice: vi.fn(),
    showCopiedNotice: vi.fn(),
    showErrorNotice: vi.fn(),
    setReplyToMessageId: vi.fn(),
    composer: {
      onPickAttachments: vi.fn(),
      onSeedMention: vi.fn(),
      canSend: true,
      draft: '',
      setDraft: vi.fn(),
      onSubmit: vi.fn(),
      isSubmitting: false,
      replySummary: null,
      clearReply: vi.fn(),
      attachments: [],
      removeAttachment: vi.fn(),
      uploadingCount: 0,
      acceptedExtensionsLabel: '',
      fileInputKey: 'file-input',
    },
    manage: {
      onInviteByEmail: vi.fn(),
    },
    channelDialog: {},
    serverDialog: {},
    memberDialog: {},
    confirmDialog: null,
    userSettingsDialog: {},
    createChannelDialog: {},
    messagesQuery: {
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
    },
    startDMDialog: {
      users: [],
      isOpen: false,
      isLoading: false,
      onClose: vi.fn(),
      onDMStarted: vi.fn(),
      onError: vi.fn(),
    },
    openMemberProfile: vi.fn(),
    mentionMember: vi.fn(),
    refreshInvitableUsers: vi.fn(),
    requestRemoveMember: vi.fn(),
    ...overrides,
  };
}

function renderShell(options?: { initialPath?: string; mode?: 'server' | 'dm' }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[options?.initialPath ?? '/groups/missing-group']}>
        <AuthProvider
          value={{
            session: {
              user: baseCurrentUser,
            },
            currentUser: baseCurrentUser,
            logout: vi.fn(),
          }}
        >
          <WorkspaceShell mode={options?.mode ?? 'server'} />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('WorkspaceShell missing server recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChannelSidebar.mockReset();
    mockFetchSystemConfig.mockResolvedValue({ rolePermissions: undefined, workStatusDefs: [] });
    mockUseWorkspaceShellModel.mockImplementation(() => createModel());
  });

  afterEach(() => {
    cleanup();
  });

  it('redirects to the first accessible group instead of showing the missing server error immediately', async () => {
    const model = createModel();
    mockUseWorkspaceShellModel.mockImplementation(() => model);

    renderShell();

    expect(screen.getByText('正在恢复当前 server...')).toBeInTheDocument();

    await waitFor(() => {
      expect(model.navigateToGroup).toHaveBeenCalledWith('group-1');
    });
  });

  it('recovers an invalid dm route back to the first visible dm conversation', async () => {
    const model = createModel({
      mode: 'dm',
      selectedGroupId: 'dm-1',
      requestedGroupId: 'dm-missing',
      selectedGroup: {
        ...baseGroup,
        id: 'dm-1',
        isDM: true,
        name: 'Alice',
      },
      groups: [
        {
          ...baseGroup,
          id: 'dm-1',
          isDM: true,
          name: 'Alice',
        },
      ],
      activeGroups: [
        {
          ...baseGroup,
          id: 'dm-1',
          isDM: true,
          name: 'Alice',
        },
      ],
      categoryGroups: [
        {
          ...baseGroup,
          id: 'dm-1',
          isDM: true,
          name: 'Alice',
        },
      ],
    });
    mockUseWorkspaceShellModel.mockImplementation(() => model);

    renderShell({ initialPath: '/dm/dm-missing', mode: 'dm' });

    expect(screen.getByText('正在恢复当前私聊...')).toBeInTheDocument();

    await waitFor(() => {
      expect(model.navigateToGroup).toHaveBeenCalledWith('dm-1');
    });
  });

  it('opens the clicked server when switching from dm mode to server mode', () => {
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        mode: 'dm',
        selectedGroupId: 'dm-1',
        requestedGroupId: 'dm-1',
        selectedGroup: {
          ...baseGroup,
          id: 'dm-1',
          isDM: true,
          name: 'Alice',
        },
        groups: [
          {
            ...baseGroup,
            id: 'dm-1',
            isDM: true,
            name: 'Alice',
          },
        ],
        servers: [
          {
            ...baseGroup,
            id: 'group-1',
            category: '研发',
            name: 'General',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
          {
            ...baseGroup,
            id: 'group-2',
            category: '产品',
            serverId: 'server-2',
            server: { ...baseGroup.server!, id: 'server-2', name: '产品' },
            name: 'Roadmap',
            updatedAt: '2026-05-03T00:00:00.000Z',
          },
          {
            ...baseGroup,
            id: 'group-3',
            category: '产品',
            name: 'Archive',
            archivedAt: '2026-05-04T00:00:00.000Z',
            updatedAt: '2026-05-04T00:00:00.000Z',
          },
        ],
        activeGroups: [
          {
            ...baseGroup,
            id: 'group-1',
            category: '研发',
            name: 'General',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
          {
            ...baseGroup,
            id: 'group-2',
            category: '产品',
            name: 'Roadmap',
            updatedAt: '2026-05-03T00:00:00.000Z',
          },
        ],
        categoryGroups: [
          {
            ...baseGroup,
            id: 'group-1',
            category: '研发',
            name: 'General',
            updatedAt: '2026-05-01T00:00:00.000Z',
          },
        ],
        categoryRailItems: [
          {
            id: 'server-1',
            name: '研发',
            activeCount: 1,
            unreadCount: 0,
            avatarUrl: null,
            isArchived: false,
          },
          {
            id: 'server-2',
            name: '产品',
            activeCount: 1,
            unreadCount: 0,
            avatarUrl: null,
            isArchived: false,
          },
        ],
      }),
    );

    renderShell({ initialPath: '/dm/dm-1', mode: 'dm' });

    fireEvent.click(screen.getByTestId('server-rail'));

    expect(mockNavigate).toHaveBeenCalledWith('/groups/group-2');
  });

  it('opens the attendance page when switching to dm mode from the server rail', () => {
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        selectedGroupId: 'group-1',
        requestedGroupId: 'group-1',
        selectedGroup: baseGroup,
      }),
    );

    renderShell();

    fireEvent.click(screen.getByTestId('open-dm'));

    expect(mockNavigate).toHaveBeenCalledWith(DM_ATTENDANCE_ROUTE);
  });

  it('uses the full content width for subscriptions without an information sidebar', () => {
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        mode: 'dm',
        selectedGroupId: '__dm_subscription__',
        requestedGroupId: '__dm_subscription__',
        selectedGroup: undefined,
        groups: [],
        isDmSpecialPage: true,
        isDmSubscriptionPage: true,
        isSecondarySurfaceViewport: true,
        header: {
          channelName: '文章',
          channelMeta: 'Markdown 发布与资料更新',
          userLabel: 'owner@example.com',
        },
      }),
    );

    renderShell({ initialPath: DM_SUBSCRIPTION_ROUTE, mode: 'dm' });

    expect(screen.getByTestId('subscription-page')).toBeInTheDocument();
    expect(screen.queryByTestId('subscription-info-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-info-sidebar-button')).not.toBeInTheDocument();
  });

  it('does not activate the message attachment drop overlay on subscription pages', () => {
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        mode: 'dm',
        selectedGroupId: '__dm_subscription__',
        requestedGroupId: '__dm_subscription__',
        selectedGroup: undefined,
        groups: [],
        isDmSpecialPage: true,
        isDmSubscriptionPage: true,
      }),
    );

    renderShell({ initialPath: DM_SUBSCRIPTION_ROUTE, mode: 'dm' });

    fireEvent.dragEnter(screen.getByTestId('subscription-page'), {
      dataTransfer: { types: ['Files'] },
    });

    expect(screen.queryByText('拖拽到消息栏发送附件')).not.toBeInTheDocument();
  });

  it('uses the full content width for attendance without a summary sidebar', () => {
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        mode: 'dm',
        selectedGroupId: '__dm_attendance__',
        requestedGroupId: '__dm_attendance__',
        selectedGroup: undefined,
        groups: [],
        isDmSpecialPage: true,
        isDmAttendancePage: true,
        isSecondarySurfaceViewport: true,
        header: {
          channelName: '出勤',
          channelMeta: '签到、时长与趋势',
          userLabel: 'owner@example.com',
        },
      }),
    );

    renderShell({ initialPath: DM_ATTENDANCE_ROUTE, mode: 'dm' });

    expect(screen.getByTestId('attendance-page')).toBeInTheDocument();
    expect(screen.queryByTestId('attendance-info-sidebar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('open-info-sidebar-button')).not.toBeInTheDocument();
  });

  it('shows a message load error instead of the empty conversation placeholder', () => {
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        selectedGroupId: 'group-1',
        requestedGroupId: 'group-1',
        selectedGroup: baseGroup,
        messagesQuery: {
          isLoading: false,
          isFetching: false,
          error: new Error('Message not found in this group.'),
          refetch: vi.fn(),
        },
      }),
    );

    renderShell();

    expect(mockMessagePane).toHaveBeenCalled();
    const messagePaneCalls = mockMessagePane.mock.calls as Array<
      [
        {
          messageLoadError?: string | null;
        }?,
      ]
    >;
    const lastCall = messagePaneCalls.at(-1)?.[0];
    expect(lastCall?.messageLoadError).toBe('消息加载失败：Message not found in this group.');
  });

  it('enables attachment artifact actions from a custom packaging-capable status', async () => {
    mockFetchSystemConfig.mockResolvedValue({
      rolePermissions: undefined,
      workStatusDefs: [
        {
          name: '准备交付',
          tone: '#ffd93d',
          textTone: '#1e1f22',
          isPackaging: true,
        },
      ],
    });
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        selectedGroupId: 'group-1',
        requestedGroupId: 'group-1',
        selectedGroup: {
          ...baseGroup,
          workState: { status: '准备交付', reason: null, updatedAt: '2026-08-12T00:00:00.000Z' },
        },
        workState: { status: '准备交付', reason: null, updatedAt: '2026-08-12T00:00:00.000Z' },
        artifacts: {
          isLocked: false,
          sourceFileIds: new Set<string>(),
          pendingSourceFileIds: new Set<string>(),
          onAddFromMessage: vi.fn(),
        },
      }),
    );

    renderShell({ initialPath: '/groups/group-1' });

    await waitFor(() => {
      const props = mockMessagePane.mock.calls.at(-1)?.[0] as {
        artifactAction?: { isEnabled: boolean };
      };
      expect(props.artifactAction?.isEnabled).toBe(true);
    });
  });

  it('marks the workspace as local development in dev builds', () => {
    mockResetOwnCheckInTodayForDev.mockResolvedValue({ workDate: '2026-07-04', deletedCount: 1 });
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        selectedGroupId: 'group-1',
        requestedGroupId: 'group-1',
        selectedGroup: baseGroup,
      }),
    );

    renderShell();

    expect(screen.getByTestId('local-dev-badge')).toHaveTextContent('本地开发环境');
    expect(screen.getByRole('button', { name: '清除今日打卡' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '触发签退提醒' })).toBeInTheDocument();
  });

  it('routes the local dev checkout reminder button into ChannelSidebar', async () => {
    mockResetOwnCheckInTodayForDev.mockResolvedValue({ workDate: '2026-07-04', deletedCount: 1 });
    mockUseWorkspaceShellModel.mockImplementation(() =>
      createModel({
        selectedGroupId: 'group-1',
        requestedGroupId: 'group-1',
        selectedGroup: baseGroup,
      }),
    );

    renderShell();

    fireEvent.click(screen.getByRole('button', { name: '触发签退提醒' }));

    await waitFor(() => {
      const lastProps = mockChannelSidebar.mock.calls.at(-1)?.[0] as {
        attendanceReminderRequest?: { kind: string; nonce: number };
      };
      expect(lastProps.attendanceReminderRequest).toEqual({ kind: 'checkout', nonce: 1 });
    });
  });
});
