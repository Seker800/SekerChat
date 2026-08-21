import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAlbumUpdateStatus } from '../lib/album-api';
import { getSubscriptionSummary } from '../lib/subscriptions-api';
import {
  DM_ALBUM_ROUTE,
  DM_ATTENDANCE_ROUTE,
  DM_SUBSCRIPTION_ROUTE,
} from '../store/workspace-store';
import { AuthenticatedApp } from './AuthenticatedApp';
import { AuthProvider } from './AuthContext';

vi.mock('../lib/album-api', () => ({
  getAlbumUpdateStatus: vi.fn(),
}));

vi.mock('../lib/subscriptions-api', () => ({
  getSubscriptionSummary: vi.fn(),
}));

vi.mock('../components/workspace/WorkspaceShell', () => ({
  WorkspaceShell: () => <div data-testid="workspace-shell" />,
}));

vi.mock('../components/admin/AdminPage', () => ({
  AdminPage: () => <div data-testid="admin-page" />,
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('AuthenticatedApp routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSubscriptionSummary).mockResolvedValue({ pendingConfirmationCount: 0 });
    vi.mocked(getAlbumUpdateStatus).mockResolvedValue({ hasUpdates: false });
  });

  function renderRoute(path: string) {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider
            value={{
              session: {
                user: {
                  id: 'user-1',
                  email: 'owner@example.com',
                  displayName: 'Owner',
                  avatarUrl: null,
                  role: 'ADMIN',
                  dndUntil: null,
                },
              },
              currentUser: {
                id: 'user-1',
                email: 'owner@example.com',
                displayName: 'Owner',
                avatarUrl: null,
                role: 'ADMIN',
                dndUntil: null,
                createdAt: '2026-08-15T00:00:00.000Z',
              },
              logout: vi.fn(),
            }}
          >
            <LocationProbe />
            <AuthenticatedApp />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it.each(['/', '/dm'] as const)(
    'opens articles from %s when confirmation is pending, ahead of album updates',
    async (path) => {
      vi.mocked(getSubscriptionSummary).mockResolvedValue({ pendingConfirmationCount: 2 });
      vi.mocked(getAlbumUpdateStatus).mockResolvedValue({ hasUpdates: true });

      renderRoute(path);

      await screen.findByTestId('workspace-shell');
      await waitFor(() => {
        expect(screen.getByTestId('location-probe')).toHaveTextContent(DM_SUBSCRIPTION_ROUTE);
      });
    },
  );

  it('opens the album when it has updates and no article confirmation is pending', async () => {
    vi.mocked(getAlbumUpdateStatus).mockResolvedValue({ hasUpdates: true });

    renderRoute('/');

    await screen.findByTestId('workspace-shell');
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(DM_ALBUM_ROUTE);
    });
  });

  it('falls back to attendance when neither surface needs attention', async () => {
    renderRoute('/dm');

    await screen.findByTestId('workspace-shell');

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(DM_ATTENDANCE_ROUTE);
    });
  });

  it('falls back to attendance when landing status cannot be loaded', async () => {
    vi.mocked(getSubscriptionSummary).mockRejectedValue(new Error('summary unavailable'));
    vi.mocked(getAlbumUpdateStatus).mockRejectedValue(new Error('album unavailable'));

    renderRoute('/');

    await screen.findByTestId('workspace-shell');
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(DM_ATTENDANCE_ROUTE);
    });
  });

  it('preserves explicit workspace deep links without running landing checks', async () => {
    renderRoute('/groups/group-42');

    await screen.findByTestId('workspace-shell');
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/groups/group-42');
    expect(getSubscriptionSummary).not.toHaveBeenCalled();
    expect(getAlbumUpdateStatus).not.toHaveBeenCalled();
  });

  it('recovers stale SekerEagle links by returning to the workspace landing route', async () => {
    renderRoute('/eagle');

    await screen.findByTestId('workspace-shell');
    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent(DM_ATTENDANCE_ROUTE);
    });
  });
});
