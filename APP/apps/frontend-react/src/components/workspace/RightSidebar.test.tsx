import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { GroupResponse } from '../../lib/groups-api';
import { RightSidebar } from './RightSidebar';

vi.mock('../../lib/dm-api', () => ({
  createOrGetDM: vi.fn(),
}));

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => true,
}));

const baseGroup: GroupResponse = {
  id: 'group-1',
  name: '频道一',
  category: '未分类',
  serverId: null,
  server: null,
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
      isOnline: false,
      isDnd: false,
    },
  ],
};

function renderSidebar(overrides: Partial<React.ComponentProps<typeof RightSidebar>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RightSidebar
          group={baseGroup}
          currentUserId="user-1"
          accessToken="token"
          isOverlay={false}
          isOpen
          artifacts={{
            items: [],
            confirmation: baseGroup.artifactConfirmation,
            canConfirm: false,
            hasArtifacts: false,
            isConfirming: false,
            isLocked: false,
            isUploading: false,
            pendingDeleteArtifactId: '',
            pendingDeleteArtifactName: '',
            onDelete: () => undefined,
            onPick: () => undefined,
            onRefresh: () => undefined,
            onToggleConfirmation: () => undefined,
          }}
          invitableUsers={[]}
          isInvitableUsersLoading={false}
          onOpenMemberProfile={() => undefined}
          onMentionMember={() => undefined}
          onRequestRemoveMember={() => undefined}
          onInviteByEmail={() => undefined}
          onClose={() => undefined}
          currentUserRole="ADMIN"
          {...overrides}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RightSidebar invite members menu', () => {
  afterEach(() => {
    delete (window as Window & typeof globalThis & { showOpenFilePicker?: unknown }).showOpenFilePicker;
    cleanup();
  });

  it('keeps the invite button available and shows an empty state when no users can be invited', async () => {
    const onRequestInvitableUsers = vi.fn();
    renderSidebar({ onRequestInvitableUsers });

    fireEvent.click(screen.getByTestId('invite-members-button'));

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('暂无可邀请成员')).toBeInTheDocument();
    expect(onRequestInvitableUsers).toHaveBeenCalledTimes(1);
  });

  it('shows a retry action when loading candidate users fails', async () => {
    const onRefreshInvitableUsers = vi.fn();
    renderSidebar({
      invitableUsersError: '用户列表加载失败',
      onRefreshInvitableUsers,
    });

    fireEvent.click(screen.getByTestId('invite-members-button'));

    const retryButton = await screen.findByText('加载失败，点击重试');
    fireEvent.click(retryButton);

    await waitFor(() => expect(onRefreshInvitableUsers).toHaveBeenCalledTimes(1));
  });

  it('shows artifact confirmation state and locks upload/delete actions', () => {
    const onToggleConfirmation = vi.fn();
    const onDelete = vi.fn();
    renderSidebar({
      group: {
        ...baseGroup,
        artifactConfirmation: {
          isConfirmed: true,
          confirmedAt: '2026-05-05T10:00:00.000Z',
          confirmedByUserId: 'user-2',
          confirmedByDisplayName: 'Member',
        },
      },
      artifacts: {
        items: [
          {
            id: 'artifact-1',
            groupId: 'group-1',
            uploaderId: 'user-1',
            originalName: 'release.zip',
            storedName: 'release.zip',
            relativePath: 'artifacts/group-1/release.zip',
            mimeType: 'application/zip',
            size: 100,
            createdAt: '2026-05-05T09:00:00.000Z',
            contentUrl: 'http://localhost/artifact',
            metadataUrl: 'http://localhost/meta',
            fileExists: true,
          },
        ],
        confirmation: {
          isConfirmed: true,
          confirmedAt: '2026-05-05T10:00:00.000Z',
          confirmedByUserId: 'user-2',
          confirmedByDisplayName: 'Member',
        },
        canConfirm: true,
        hasArtifacts: true,
        isConfirming: false,
        isLocked: true,
        isUploading: false,
        pendingDeleteArtifactId: '',
        pendingDeleteArtifactName: '',
        onDelete,
        onPick: () => undefined,
        onRefresh: () => undefined,
        onToggleConfirmation,
      },
    });

    expect(screen.getByText(/Member 已确认当前产出/)).toBeInTheDocument();
    expect(screen.getAllByTitle('当前产出已确认，请先解除确认')).toHaveLength(3);
    for (const button of screen.getAllByTitle('当前产出已确认，请先解除确认')) {
      if (button.tagName === 'LABEL') {
        expect(button).toHaveAttribute('aria-disabled', 'true');
      } else {
        expect(button).toBeDisabled();
      }
    }

    fireEvent.click(screen.getByText('解除确认'));
    expect(onToggleConfirmation).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(0);
  });

  it('renders an active artifact drop zone when file dragging is in progress', () => {
    renderSidebar({
      isArtifactDropActive: true,
    });

    expect(screen.getByTestId('artifact-drop-zone')).toHaveTextContent('拖拽到产出区上传交付文件');
  });

  it('clears the shared drag state after dropping files into the artifact zone', () => {
    const onArtifactDropHandled = vi.fn();
    const onPick = vi.fn();
    renderSidebar({
      onArtifactDropHandled,
      artifacts: {
        items: [],
        confirmation: baseGroup.artifactConfirmation,
        canConfirm: false,
        hasArtifacts: false,
        isConfirming: false,
        isLocked: false,
        isUploading: false,
        pendingDeleteArtifactId: '',
        pendingDeleteArtifactName: '',
        onDelete: () => undefined,
        onPick,
        onRefresh: () => undefined,
        onToggleConfirmation: () => undefined,
      },
    });

    const file = new File(['artifact'], 'artifact.zip', { type: 'application/zip' });
    fireEvent.drop(screen.getByTestId('artifact-drop-zone'), {
      dataTransfer: {
        files: [file],
        types: ['Files'],
      },
    });

    expect(onArtifactDropHandled).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('uses a generic file input for artifact uploads on narrow viewports', async () => {
    const pickedFile = new File(['artifact'], 'artifact.zip', { type: 'application/zip' });
    const onPick = vi.fn();
    renderSidebar({
      artifacts: {
        items: [],
        confirmation: baseGroup.artifactConfirmation,
        canConfirm: false,
        hasArtifacts: false,
        isConfirming: false,
        isLocked: false,
        isUploading: false,
        pendingDeleteArtifactId: '',
        pendingDeleteArtifactName: '',
        onDelete: () => undefined,
        onPick,
        onRefresh: () => undefined,
        onToggleConfirmation: () => undefined,
      },
    });

    fireEvent.click(screen.getByTitle('上传文件'));
    const fileInput = document.querySelector<HTMLInputElement>('#artifact-file-upload-group-1');
    expect(fileInput).toBeInTheDocument();
    fireEvent.change(fileInput!, {
      target: {
        files: [pickedFile],
      },
    });

    await waitFor(() => {
      expect(onPick).toHaveBeenCalledWith([pickedFile]);
    });
  });
});
