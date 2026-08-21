import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const authApiMocks = vi.hoisted(() => ({
  createOidcLoginUrl: vi.fn(() => '/api/auth/browser/oidc/login'),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
  register: vi.fn(),
}));
const groupsApiMocks = vi.hoisted(() => ({
  listGroups: vi.fn(),
}));

const workspaceShellMock = vi.hoisted(() => vi.fn(() => <div data-testid="workspace-shell" />));
const adminPageMock = vi.hoisted(() => vi.fn(() => <div data-testid="admin-page" />));

vi.mock('./lib/auth-api', () => authApiMocks);
vi.mock('./lib/groups-api', () => groupsApiMocks);
vi.mock('./components/workspace/WorkspaceShell', () => ({
  WorkspaceShell: workspaceShellMock,
}));
vi.mock('./components/admin/AdminPage', () => ({
  AdminPage: adminPageMock,
}));

function renderApp(initialPath = '/groups') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function lastComponentProps(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = mock.mock.calls.at(-1);
  expect(call).toBeDefined();
  return (call?.[0] ?? {}) as Record<string, unknown>;
}

describe('App auth boundary', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      displayName: 'User',
      avatarUrl: null,
      role: 'MEMBER',
      createdAt: '2026-05-11T00:00:00.000Z',
      dndUntil: null,
    };
    authApiMocks.refreshSession.mockResolvedValue({ user });
    authApiMocks.getCurrentUser.mockResolvedValue(user);
    groupsApiMocks.listGroups.mockResolvedValue([
      {
        id: 'group-1',
        name: 'Group 1',
      },
    ]);
  });

  it('does not pass raw access tokens through route component props', async () => {
    renderApp('/groups');

    expect(screen.getByTestId('workspace-startup-screen')).toBeInTheDocument();
    expect(screen.queryByText('正在恢复登录状态...')).not.toBeInTheDocument();

    await screen.findByTestId('workspace-shell');

    await waitFor(() => {
      expect(workspaceShellMock).toHaveBeenCalled();
    });

    const props = lastComponentProps(workspaceShellMock);
    expect(props).not.toHaveProperty('accessToken');
  });

  it('keeps admin pages behind the same auth context boundary', async () => {
    renderApp('/admin');

    await screen.findByTestId('admin-page');

    await waitFor(() => {
      expect(adminPageMock).toHaveBeenCalled();
    });

    const props = lastComponentProps(adminPageMock);
    expect(props).not.toHaveProperty('accessToken');
  });

  it('renders the login gate before authenticated routes', async () => {
    authApiMocks.getCurrentUser.mockRejectedValue(new Error('登录状态已失效'));
    authApiMocks.refreshSession.mockRejectedValue(new Error('登录状态已失效'));

    renderApp('/groups');

    await screen.findByTestId('auth-panel');
    expect(screen.getByTestId('auth-dev-notice')).toHaveTextContent('本地开发环境');
    expect(screen.getByTestId('app-version')).toHaveTextContent(/^SekerChat v/);
    expect(screen.queryByTestId('oidc-login-button')).not.toBeInTheDocument();
    expect(screen.queryByText('通过群晖统一登录')).not.toBeInTheDocument();
    expect(screen.queryByText('团队频道')).not.toBeInTheDocument();
    expect(screen.queryByText('# 当班确认')).not.toBeInTheDocument();
    expect(screen.queryByTestId('workspace-shell')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-page')).not.toBeInTheDocument();
  });

  it('routes the root path to the attendance workspace without a duplicate groups request', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('workspace-shell')).toBeInTheDocument();
    });

    expect(groupsApiMocks.listGroups).not.toHaveBeenCalled();
  });
});
