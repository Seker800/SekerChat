import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerRail } from './ServerRail';
import type { CategoryRailItem } from './useServerCategories';

afterEach(() => {
  cleanup();
});

function renderServerRail({
  canCreateServers = true,
  canManageServerSettings = true,
  archivedCategories = [],
  dmUnreadCount = 0,
  isDMMode = false,
  isOverlay = false,
  isOverlayOpen = false,
  onOpenCategorySettings = vi.fn(),
  onOpenCreateServer = vi.fn(),
  onOpenDM = vi.fn(),
  onSelect = vi.fn(),
}: {
  canCreateServers?: boolean;
  canManageServerSettings?: boolean;
  archivedCategories?: CategoryRailItem[];
  dmUnreadCount?: number;
  isDMMode?: boolean;
  isOverlay?: boolean;
  isOverlayOpen?: boolean;
  onOpenCategorySettings?: (server: CategoryRailItem) => void;
  onOpenCreateServer?: () => void;
  onOpenDM?: () => void;
  onSelect?: (serverId: string) => void;
} = {}) {
  const activeServer: CategoryRailItem = {
    id: 'server-1',
    name: '研发',
    avatarUrl: null,
    activeCount: 1,
    unreadCount: 0,
    isArchived: false,
  };

  render(
    <ServerRail
      categories={[activeServer]}
      archivedCategories={archivedCategories}
      selectedServerId="server-1"
      isDMMode={isDMMode}
      dmUnreadCount={dmUnreadCount}
      isOverlay={isOverlay}
      isOverlayOpen={isOverlayOpen}
      canCreateServers={canCreateServers}
      canManageServerSettings={canManageServerSettings}
      onOpenDM={onOpenDM}
      onSelect={onSelect}
      onOpenCreateServer={onOpenCreateServer}
      onOpenCategorySettings={onOpenCategorySettings}
    />,
  );
}

describe('ServerRail', () => {
  it('reveals the create-server action from the collapsed section even without archives', () => {
    const onOpenCreateServer = vi.fn();
    renderServerRail({ onOpenCreateServer });

    expect(screen.queryByRole('button', { name: '新建 Server' })).not.toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: '展开 Server 操作' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: '收起 Server 操作' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: '新建 Server' }));

    expect(onOpenCreateServer).toHaveBeenCalledOnce();
  });

  it('disables the create-server action when the user cannot create servers', () => {
    renderServerRail({ canCreateServers: false });

    fireEvent.click(screen.getByRole('button', { name: '展开 Server 操作' }));

    expect(screen.getByRole('button', { name: '新建 Server' })).toBeDisabled();
  });

  it('keeps archived servers available in the expanded section', () => {
    const onSelect = vi.fn();
    renderServerRail({
      archivedCategories: [
        {
          id: 'server-archived',
          name: '旧项目',
          avatarUrl: null,
          activeCount: 0,
          unreadCount: 0,
          isArchived: true,
        },
      ],
      onSelect,
    });

    fireEvent.click(screen.getByRole('button', { name: '展开 Server 操作' }));
    fireEvent.click(screen.getByTitle('旧项目 · 已归档'));

    expect(onSelect).toHaveBeenCalledWith('server-archived');
  });

  it('keeps create and settings permissions independent in the server context menu', () => {
    const onOpenCategorySettings = vi.fn();
    renderServerRail({
      canCreateServers: false,
      canManageServerSettings: true,
      onOpenCategorySettings,
    });

    fireEvent.contextMenu(screen.getByTestId('server-rail-category'));

    expect(screen.getByRole('menuitem', { name: '新建 server' })).toBeDisabled();
    fireEvent.click(screen.getByRole('menuitem', { name: '打开 server 设置' }));
    expect(onOpenCategorySettings).toHaveBeenCalledOnce();
  });

  it('keeps the inbox and active Server navigation working', () => {
    const onOpenDM = vi.fn();
    const onSelect = vi.fn();
    renderServerRail({ onOpenDM, onSelect });

    fireEvent.click(screen.getByRole('button', { name: '私聊/收件箱' }));
    const activeServerButton = screen.getByTestId('server-rail-category');
    fireEvent.mouseDown(activeServerButton);
    fireEvent.click(activeServerButton);

    expect(onOpenDM).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith('server-1');
  });

  it('opens archived Server settings with a secondary click without selecting it', () => {
    const onOpenCategorySettings = vi.fn();
    const onSelect = vi.fn();
    const archivedServer: CategoryRailItem = {
      id: 'server-archived',
      name: '旧项目',
      avatarUrl: null,
      activeCount: 0,
      unreadCount: 0,
      isArchived: true,
    };
    renderServerRail({ archivedCategories: [archivedServer], onOpenCategorySettings, onSelect });

    fireEvent.click(screen.getByRole('button', { name: '展开 Server 操作' }));
    const archivedButton = screen.getByTitle('旧项目 · 已归档');
    fireEvent.mouseDown(archivedButton, { button: 0, ctrlKey: true, clientX: 20, clientY: 30 });
    fireEvent.click(archivedButton);
    fireEvent.click(screen.getByRole('menuitem', { name: '打开 server 设置' }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(onOpenCategorySettings).toHaveBeenCalledWith(archivedServer);
  });

  it('renders the DM unread cap and overlay state', () => {
    renderServerRail({ dmUnreadCount: 101, isDMMode: true, isOverlay: true, isOverlayOpen: true });

    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.getByRole('complementary').className).toContain('railOverlayVisible');
  });

  it('disables settings separately when only Server creation is allowed', () => {
    renderServerRail({ canCreateServers: true, canManageServerSettings: false });

    fireEvent.contextMenu(screen.getByTestId('server-rail-category'));

    expect(screen.getByRole('menuitem', { name: '新建 server' })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: '打开 server 设置' })).toBeDisabled();
  });
});
