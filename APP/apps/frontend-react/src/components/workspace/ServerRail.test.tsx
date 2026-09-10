import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerRail } from './ServerRail';

afterEach(() => {
  cleanup();
});

function renderServerRail({
  canManageServers = true,
  onOpenCreateServer = vi.fn(),
}: {
  canManageServers?: boolean;
  onOpenCreateServer?: () => void;
} = {}) {
  render(
    <ServerRail
      categories={[
        {
          id: 'server-1',
          name: '研发',
          avatarUrl: null,
          activeCount: 1,
          archivedCount: 0,
          unreadCount: 0,
          latestAt: '2026-09-10T00:00:00.000Z',
        },
      ]}
      archivedCategories={[]}
      selectedServerId="server-1"
      isDMMode={false}
      dmUnreadCount={0}
      canManageServers={canManageServers}
      onOpenDM={vi.fn()}
      onSelect={vi.fn()}
      onOpenCreateServer={onOpenCreateServer}
      onOpenCategorySettings={vi.fn()}
    />,
  );
}

describe('ServerRail', () => {
  it('reveals the create-server action from the collapsed section even without archives', () => {
    const onOpenCreateServer = vi.fn();
    renderServerRail({ onOpenCreateServer });

    expect(screen.queryByRole('button', { name: '新建 Server' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '展开 Server 操作' }));
    fireEvent.click(screen.getByRole('button', { name: '新建 Server' }));

    expect(onOpenCreateServer).toHaveBeenCalledOnce();
  });

  it('disables the create-server action when the user cannot manage servers', () => {
    renderServerRail({ canManageServers: false });

    fireEvent.click(screen.getByRole('button', { name: '展开 Server 操作' }));

    expect(screen.getByRole('button', { name: '新建 Server' })).toBeDisabled();
  });
});
