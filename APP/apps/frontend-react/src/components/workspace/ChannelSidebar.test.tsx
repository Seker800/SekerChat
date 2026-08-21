import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { CurrentUserResponse } from '../../lib/auth-api';
import type { GroupResponse } from '../../lib/groups-api';
import { ChannelSidebar } from './ChannelSidebar';

vi.mock('../../lib/auth-api', () => ({
  updateUserProfile: vi.fn(),
}));

vi.mock('../../lib/attendance-api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/attendance-api')>('../../lib/attendance-api');
  return {
    ...actual,
    fetchOwnCheckInToday: vi.fn(),
    checkIn: vi.fn(),
    checkOut: vi.fn(),
  };
});

const baseCurrentUser: CurrentUserResponse = {
  id: 'user-1',
  email: 'owner@example.com',
  displayName: 'Owner',
  avatarUrl: null,
  role: 'ADMIN',
  dndUntil: null,
  createdAt: '2026-05-01T00:00:00.000Z',
};

const baseDmGroup: GroupResponse = {
  id: 'dm-1',
  name: 'Member',
  category: '私聊',
  serverId: null,
  server: null,
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
  members: [
    {
      userId: 'user-1',
      email: 'owner@example.com',
      displayName: 'Owner',
      avatarUrl: null,
      role: 'ADMIN',
      joinedAt: '2026-05-01T00:00:00.000Z',
      isOnline: true,
      isDnd: false,
    },
    {
      userId: 'user-2',
      email: 'member@example.com',
      displayName: 'Member',
      avatarUrl: null,
      role: 'MEMBER',
      joinedAt: '2026-05-01T00:00:00.000Z',
      isOnline: true,
      isDnd: false,
    },
  ],
};

function renderSidebar(
  overrides: Partial<React.ComponentProps<typeof ChannelSidebar>> = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChannelSidebar
          mode="dm"
          categoryName="私聊"
          serverOptions={[]}
          groups={[baseDmGroup]}
          archivedGroups={[]}
          selectedGroupId="dm-1"
          isMobileSidebarOpen={false}
          currentUser={baseCurrentUser}
          accessToken="token"
          onSelectGroup={() => undefined}
          onCloseMobileSidebar={() => undefined}
          onOpenChannelSettings={() => undefined}
          onOpenInviteMembers={() => undefined}
          onOpenStatusEditor={() => undefined}
          onSetWorkStatus={() => undefined}
          onChangeCategory={() => undefined}
          onRequestArchiveGroup={() => undefined}
          onOpenUserSettings={() => undefined}
          currentUserIsDnd={false}
          {...overrides}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('album update indicator', () => {
  it('shows one numberless red dot only when the album has updates', () => {
    renderSidebar({ albumHasUpdates: true });
    expect(screen.getByLabelText('相册有新内容')).toBeInTheDocument();
    expect(screen.getByLabelText('相册有新内容')).toHaveTextContent('');

    cleanup();
    renderSidebar({ albumHasUpdates: false });
    expect(screen.queryByLabelText('相册有新内容')).not.toBeInTheDocument();
  });
});

function renderSidebarTree(
  props: Partial<React.ComponentProps<typeof ChannelSidebar>> = {},
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ChannelSidebar
          mode="dm"
          categoryName="私聊"
          serverOptions={[]}
          groups={[baseDmGroup]}
          archivedGroups={[]}
          selectedGroupId="dm-1"
          isMobileSidebarOpen={false}
          currentUser={baseCurrentUser}
          accessToken="token"
          onSelectGroup={() => undefined}
          onCloseMobileSidebar={() => undefined}
          onOpenChannelSettings={() => undefined}
          onOpenInviteMembers={() => undefined}
          onOpenStatusEditor={() => undefined}
          onSetWorkStatus={() => undefined}
          onChangeCategory={() => undefined}
          onRequestArchiveGroup={() => undefined}
          onOpenUserSettings={() => undefined}
          currentUserIsDnd={false}
          {...props}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('ChannelSidebar current user dnd state', () => {
  beforeEach(async () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-04T09:30:00.000Z').getTime());
    const { fetchOwnCheckInToday } = await import('../../lib/attendance-api');
    vi.mocked(fetchOwnCheckInToday).mockResolvedValue({
      workDate: '2026-07-04',
      status: 'CHECKED_OUT',
      checkInAt: '2026-07-04T00:00:00.000Z',
      checkOutAt: '2026-07-04T08:30:00.000Z',
      checkInMinutes: 510,
      onlineMinutes: 0,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders the current user avatar and moon button from the realtime dnd source', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const { rerender } = render(renderSidebarTree({
      currentUser: {
        ...baseCurrentUser,
        dndUntil: null,
      },
      currentUserIsDnd: false,
    }, queryClient));

    expect(screen.getByLabelText('关闭通知').querySelector('svg')).toHaveAttribute('fill', 'none');
    expect(document.querySelector('[data-status-kind=\"dnd\"]')).toBeNull();

    rerender(renderSidebarTree({
      currentUser: {
        ...baseCurrentUser,
        dndUntil: null,
      },
      currentUserIsDnd: true,
    }, queryClient));

    expect(screen.getByLabelText('开启通知').querySelector('svg')).toHaveAttribute('fill', '#eab308');
    expect(document.querySelector('[data-status-kind=\"dnd\"]')).not.toBeNull();
  });

  it('keeps the optimistic moon state until realtime state catches up', async () => {
    const { updateUserProfile } = await import('../../lib/auth-api');
    vi.mocked(updateUserProfile).mockResolvedValue({
      id: 'user-1',
      email: 'owner@example.com',
      displayName: 'Owner',
      avatarUrl: null,
      avatarStorageKey: null,
      role: 'ADMIN',
      createdAt: '2026-05-01T00:00:00.000Z',
    });

    renderSidebar({
      currentUserIsDnd: false,
    });

    fireEvent.click(screen.getByLabelText('关闭通知'));

    expect(screen.getByLabelText('开启通知').querySelector('svg')).toHaveAttribute('fill', '#eab308');
  });

  it('routes avatar and identity prompts to the correct profile actions', () => {
    const onOpenUserSettings = vi.fn();
    const onChangeUserAvatar = vi.fn();

    renderSidebar({ onOpenUserSettings, onChangeUserAvatar });

    const avatarPrompt = screen.getByLabelText('修改头像');
    const idPrompt = screen.getByLabelText('打开个人设置，修改昵称 / ID');

    expect(avatarPrompt).toHaveAttribute('data-tooltip', '点击修改头像');
    expect(idPrompt).toHaveAttribute('data-tooltip', '点击修改昵称 / ID');
    expect(avatarPrompt.textContent).toContain('点击修改头像');
    expect(idPrompt.textContent).toContain('点击修改昵称 / ID');

    fireEvent.click(avatarPrompt);
    fireEvent.click(idPrompt);

    expect(onChangeUserAvatar).toHaveBeenCalledTimes(1);
    expect(onOpenUserSettings).toHaveBeenCalledWith('editDisplayName');
  });

  it('auto-opens the attendance panel when today is not checked in', async () => {
    const { fetchOwnCheckInToday } = await import('../../lib/attendance-api');
    vi.mocked(fetchOwnCheckInToday).mockResolvedValue({
      workDate: '2026-07-04',
      status: 'NOT_CHECKED_IN',
      checkInAt: null,
      checkOutAt: null,
      checkInMinutes: 0,
      onlineMinutes: 0,
    });

    renderSidebar();

    const popover = await screen.findByTestId('attendance-popover');
    expect(popover).toHaveTextContent('提醒');
    expect(popover).toHaveTextContent('签到');
    expect(screen.getByLabelText('提醒动作')).toBeInTheDocument();
  });

  it('does not auto-open the attendance panel when today is already checked out', async () => {
    renderSidebar();

    await waitFor(() => {
      expect(screen.queryByTestId('attendance-popover')).toBeNull();
    });
  });

  it('opens the same attendance popover for a forced checkout reminder request', async () => {
    const { fetchOwnCheckInToday } = await import('../../lib/attendance-api');
    vi.mocked(fetchOwnCheckInToday).mockResolvedValue({
      workDate: '2026-07-04',
      status: 'CHECKED_IN',
      checkInAt: '2026-07-04T01:00:00.000Z',
      checkOutAt: null,
      checkInMinutes: 510,
      onlineMinutes: 480,
    });

    renderSidebar({
      attendanceReminderRequest: {
        kind: 'checkout',
        nonce: 1,
      },
    });

    const popover = await screen.findByTestId('attendance-popover');
    await waitFor(() => {
      expect(popover).toHaveTextContent('提醒');
      expect(popover).toHaveTextContent('签退');
    });
    expect(screen.getByLabelText('提醒动作')).toBeInTheDocument();
  });

  it('keeps the attendance panel open when clicking outside of it', async () => {
    const { fetchOwnCheckInToday } = await import('../../lib/attendance-api');
    vi.mocked(fetchOwnCheckInToday).mockResolvedValue({
      workDate: '2026-07-04',
      status: 'NOT_CHECKED_IN',
      checkInAt: null,
      checkOutAt: null,
      checkInMinutes: 0,
      onlineMinutes: 0,
    });

    renderSidebar();

    const popover = await screen.findByTestId('attendance-popover');

    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(popover).toBeInTheDocument();
      expect(popover).toHaveAttribute('data-state', 'open');
    });
  });
});
