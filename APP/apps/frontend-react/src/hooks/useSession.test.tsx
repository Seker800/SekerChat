import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './useSession';

const authApiMocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  createOidcLoginUrl: vi.fn(() => '/api/auth/browser/oidc/login'),
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
  register: vi.fn(),
}));

const mediaCacheMocks = vi.hoisted(() => ({ clearPrivateMediaCache: vi.fn() }));

vi.mock('../lib/auth-api', () => authApiMocks);
vi.mock('../components/workspace/media/privateMediaRepository', () => mediaCacheMocks);

const currentUser = {
  id: 'user-1',
  email: 'user@example.com',
  displayName: 'User',
  avatarUrl: null,
  role: 'MEMBER',
  createdAt: '2026-05-11T00:00:00.000Z',
  dndUntil: null,
  mustChangePassword: false,
};

describe('useSession cookie-only browser contract', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it('bootstraps from users/me without reading or writing browser token storage', async () => {
    sessionStorage.setItem('sekerchat_refresh', 'legacy-secret');
    authApiMocks.getCurrentUser.mockResolvedValue(currentUser);

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(authApiMocks.getCurrentUser).toHaveBeenCalledWith();
    expect(authApiMocks.refreshSession).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('sekerchat_refresh')).toBeNull();
    expect(result.current.session).toEqual({ user: currentUser });
  });

  it('refreshes only through the cookie when the access cookie has expired', async () => {
    authApiMocks.getCurrentUser
      .mockRejectedValueOnce(new Error('登录状态已失效，请重新登录。'))
      .mockResolvedValueOnce(currentUser);
    authApiMocks.refreshSession.mockResolvedValue({ user: currentUser });

    const { result } = renderHook(() => useSession());

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));
    expect(authApiMocks.refreshSession).toHaveBeenCalledWith();
    expect(authApiMocks.getCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('logs out through the cookie endpoint and clears local user state', async () => {
    authApiMocks.getCurrentUser.mockResolvedValue(currentUser);
    authApiMocks.logout.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    act(() => result.current.logout());

    expect(authApiMocks.logout).toHaveBeenCalledWith();
    expect(mediaCacheMocks.clearPrivateMediaCache).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('adopts the password-change session without exposing a token', async () => {
    authApiMocks.getCurrentUser.mockResolvedValue({ ...currentUser, mustChangePassword: true });
    authApiMocks.changePassword.mockResolvedValue({ user: currentUser });
    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => result.current.changeOwnPassword('OldPass1', 'NewPass2'));

    expect(authApiMocks.changePassword).toHaveBeenCalledWith('OldPass1', 'NewPass2');
    expect(result.current.session).toEqual({ user: currentUser });
    expect('accessToken' in (result.current.session ?? {})).toBe(false);
    expect('refreshToken' in (result.current.session ?? {})).toBe(false);
  });
});
