import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserManagementSection } from './UserManagementSection';

vi.mock('../../lib/users-api', () => ({
  fetchUsers: vi.fn(),
  updateUserRole: vi.fn(),
  deleteUser: vi.fn(),
  setUserDisabled: vi.fn(),
  resetUserPassword: vi.fn(),
  userDisplayName: (user: { displayName?: string | null; email?: string | null }) =>
    user.displayName || (user.email && !user.email.endsWith('@deleted.local') ? user.email : '已注销用户'),
}));

import { deleteUser, fetchUsers, resetUserPassword, setUserDisabled } from '../../lib/users-api';

describe('UserManagementSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });

  it('deactivates a user and keeps them in the list as deactivated', async () => {
    vi.mocked(fetchUsers).mockResolvedValue([
      {
        id: 'user-1',
        email: '000@000.com',
        displayName: 'test',
        avatarUrl: null,
        role: 'MEMBER',
        createdAt: '2026-05-06T01:10:08.000Z',
        dndUntil: null
      },
    ]);
    vi.mocked(deleteUser).mockResolvedValue();

    render(
      <UserManagementSection
        accessToken="token"
        currentUser={{
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin',
          avatarUrl: null,
          role: 'SUPER_ADMIN',
          createdAt: '2026-05-01T00:00:00.000Z',
        dndUntil: null
        }}
        canManageRoles
      />,
    );

    expect(await screen.findByText('000@000.com')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '注销用户' }));

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledWith('token', 'user-1');
    });
    await waitFor(() => {
      expect(screen.getByText('已注销')).toBeTruthy();
    });
  });

  it('marks a user as disabled after confirmation', async () => {
    vi.mocked(fetchUsers).mockResolvedValue([
      {
        id: 'user-1',
        email: '000@000.com',
        displayName: 'test',
        avatarUrl: null,
        role: 'MEMBER',
        createdAt: '2026-05-06T01:10:08.000Z',
        dndUntil: null,
        disabledAt: null,
      },
    ]);
    vi.mocked(setUserDisabled).mockResolvedValue({
      id: 'user-1',
      email: '000@000.com',
      displayName: 'test',
      avatarUrl: null,
      role: 'MEMBER',
      createdAt: '2026-05-06T01:10:08.000Z',
      dndUntil: null,
      disabledAt: '2026-05-06T01:20:00.000Z',
    });

    render(
      <UserManagementSection
        accessToken="token"
        currentUser={{
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin',
          avatarUrl: null,
          role: 'SUPER_ADMIN',
          createdAt: '2026-05-01T00:00:00.000Z',
        dndUntil: null
        }}
        canManageRoles
      />,
    );

    expect(await screen.findByText('000@000.com')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '停用用户' }));

    await waitFor(() => {
      expect(setUserDisabled).toHaveBeenCalledWith('token', 'user-1', true);
    });
    await waitFor(() => {
      expect(screen.getByText('已停用')).toBeTruthy();
    });
  });

  it('does not show bot users in user management', async () => {
    vi.mocked(fetchUsers).mockResolvedValue([
      {
        id: 'bot-1',
        email: 'bot@example.com',
        displayName: 'OpenClaw',
        avatarUrl: null,
        role: 'CLI_BOT',
        createdAt: '2026-05-06T01:10:08.000Z',
        dndUntil: null,
        disabledAt: null,
      },
      {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        avatarUrl: null,
        role: 'MEMBER',
        createdAt: '2026-05-06T01:10:08.000Z',
        dndUntil: null,
        disabledAt: null,
      },
    ]);

    render(
      <UserManagementSection
        accessToken="token"
        currentUser={{
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin',
          avatarUrl: null,
          role: 'SUPER_ADMIN',
          createdAt: '2026-05-01T00:00:00.000Z',
          dndUntil: null
        }}
        canManageRoles
      />,
    );

    expect(await screen.findByText('user@example.com')).toBeTruthy();
    expect(screen.queryByText('bot@example.com')).toBeNull();
  });

  it('resets a member password and marks it for required change', async () => {
    vi.mocked(fetchUsers).mockResolvedValue([
      {
        id: 'user-1',
        email: 'member@example.com',
        displayName: 'Member',
        avatarUrl: null,
        role: 'MEMBER',
        createdAt: '2026-05-06T01:10:08.000Z',
        dndUntil: null,
        disabledAt: null,
      },
    ]);
    vi.mocked(resetUserPassword).mockResolvedValue();

    render(
      <UserManagementSection
        accessToken="token"
        currentUser={{
          id: 'admin-1',
          email: 'admin@example.com',
          displayName: 'Admin',
          avatarUrl: null,
          role: 'SUPER_ADMIN',
          createdAt: '2026-05-01T00:00:00.000Z',
          dndUntil: null,
        }}
        canManageRoles
      />,
    );

    await screen.findByText('member@example.com');
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));
    fireEvent.change(screen.getByPlaceholderText('临时密码'), { target: { value: 'TempPass2' } });
    fireEvent.change(screen.getByPlaceholderText('确认临时密码'), { target: { value: 'TempPass2' } });
    fireEvent.click(screen.getByRole('button', { name: '确认重置' }));

    await waitFor(() => {
      expect(resetUserPassword).toHaveBeenCalledWith('token', 'user-1', 'TempPass2');
    });
    expect(await screen.findByText('待修改密码')).toBeTruthy();
  });
});
