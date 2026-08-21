import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../auth/AuthContext';
import { Avatar } from './Avatar';
import styles from './Avatar.module.css';

describe('Avatar', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['avatar'], { type: 'image/png' }))));
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:avatar'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('supports an explicit bearer credential for compatibility callers', async () => {
    const fetchMock = vi.mocked(fetch);
    const authValue = {
      session: {
        user: {
          id: 'user-1',
          email: 'admin@example.com',
          displayName: 'Admin',
          avatarUrl: null,
          role: 'ADMIN',
          dndUntil: null,
          createdAt: '2026-05-01T00:00:00.000Z',
        },
      },
      currentUser: {
        id: 'user-1',
        email: 'admin@example.com',
        displayName: 'Admin',
        avatarUrl: null,
        role: 'ADMIN',
        dndUntil: null,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
      logout: vi.fn(),
    };

    const { rerender } = render(
      <AuthProvider value={authValue}>
        <Avatar avatarUrl="http://api.example.test/api/avatars/servers/dev/content?v=one" name="Dev" size={40} accessToken="token" />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByAltText('Dev')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.example.test/api/avatars/servers/dev/content?v=one',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
    expect(screen.getByAltText('Dev')).toHaveAttribute('src', 'blob:avatar');

    rerender(
      <AuthProvider value={authValue}>
        <Avatar avatarUrl="http://api.example.test/api/avatars/servers/dev/content?v=two" name="Dev" size={40} accessToken="token" />
      </AuthProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://api.example.test/api/avatars/servers/dev/content?v=two',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar');
  });

  it('uses the resolved avatar URL directly when no auth context is available', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<Avatar avatarUrl="http://api.example.test/api/avatars/servers/dev/content?v=one" name="Dev" size={40} />);

    await waitFor(() => expect(screen.getByAltText('Dev')).toBeInTheDocument());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByAltText('Dev')).toHaveAttribute(
      'src',
      'http://api.example.test/api/avatars/servers/dev/content?v=one',
    );
  });

  it('uses a black background for fallback letter avatars', () => {
    render(<Avatar avatarUrl={null} name="研发" size={40} />);

    const glyph = screen.getByText('研');
    expect(glyph).toBeInTheDocument();
    expect(glyph).toHaveClass(styles.glyph);
  });

  it('does not render a dnd dot when the user is offline', () => {
    const { container } = render(<Avatar avatarUrl={null} name="研发" size={40} isOnline={false} isDnd />);

    expect(container.querySelector('[data-status-kind]')).toBeNull();
  });

  it('renders a yellow dot only when dnd is paired with online', () => {
    const { container } = render(<Avatar avatarUrl={null} name="研发" size={40} isOnline isDnd />);

    expect(container.querySelector('[data-status-kind="dnd"]')).toBeInTheDocument();
  });
});
