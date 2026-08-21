import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchApi,
  authHeaders,
  bearerHeader,
  BROWSER_COOKIE_CREDENTIAL,
  isLikelyBrowserReachableUrl,
  parseResponse,
  registerAuthSessionController,
  resolveBrowserReachableUrl,
} from './api-core';

describe('browser credential headers', () => {
  it('omits Authorization when the browser uses its HttpOnly cookie session', () => {
    expect(new Headers(authHeaders()).has('Authorization')).toBe(false);
    expect(new Headers(authHeaders('')).has('Authorization')).toBe(false);
    expect(new Headers(bearerHeader()).has('Authorization')).toBe(false);
    expect(new Headers(authHeaders(BROWSER_COOKIE_CREDENTIAL)).has('Authorization')).toBe(false);
    expect(new Headers(bearerHeader(BROWSER_COOKIE_CREDENTIAL)).has('Authorization')).toBe(false);
  });

  it('keeps explicit bearer support for non-browser compatibility callers', () => {
    expect(new Headers(authHeaders('token')).get('Authorization')).toBe('Bearer token');
    expect(new Headers(bearerHeader('token')).get('Authorization')).toBe('Bearer token');
  });
});

describe('parseResponse', () => {
  it('preserves backend 401 messages instead of always reporting session expiry', async () => {
    const response = new Response(
      JSON.stringify({ message: '邮箱或密码错误', statusCode: 401 }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    await expect(parseResponse(response)).rejects.toThrow('邮箱或密码错误');
  });

  it('falls back to session expiry text for bare 401 responses', async () => {
    const response = new Response('', {
      status: 401,
    });

    await expect(parseResponse(response)).rejects.toThrow('登录状态已失效，请重新登录。');
  });

  it('surfaces backend error codes and request ids when no public message is present', async () => {
    const response = new Response(
      JSON.stringify({ code: 'DATABASE_SCHEMA_MISMATCH', requestId: 'req-123' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    await expect(parseResponse(response)).rejects.toThrow('DATABASE_SCHEMA_MISMATCH · requestId: req-123');
  });

  it('uses the request id header as a fallback for structured errors', async () => {
    const response = new Response(
      JSON.stringify({ code: 'INTERNAL_ERROR' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'X-Request-Id': 'req-header',
        },
      },
    );

    await expect(parseResponse(response)).rejects.toThrow('INTERNAL_ERROR · requestId: req-header');
  });
});

describe('fetchApi cookie-session retry', () => {
  afterEach(() => {
    registerAuthSessionController(null);
    vi.restoreAllMocks();
  });

  it('refreshes and retries once with credentials when a cookie-authenticated request returns 401', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    registerAuthSessionController({
      refreshSession: vi.fn(async () => true),
    });

    const response = await fetchApi('http://example.com/api/groups');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ credentials: 'include' });
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).has('Authorization')).toBe(false);
  });

  it('does not retry infinitely when refresh cannot provide a new access token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }));

    registerAuthSessionController({
      refreshSession: vi.fn(async () => false),
    });

    const response = await fetchApi('http://example.com/api/groups');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('skips auth refresh when retry is explicitly disabled', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('', { status: 401 }));

    const refreshSession = vi.fn(async () => true);
    registerAuthSessionController({
      refreshSession,
    });

    const response = await fetchApi(
      'http://example.com/api/users/me',
      {
        credentials: 'include',
      },
      undefined,
      { disableAuthRetry: true },
    );

    expect(response.status).toBe(401);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('resolveBrowserReachableUrl', () => {
  it('rejects container-internal MinIO hostnames so callers can fall back to API proxy', () => {
    expect(resolveBrowserReachableUrl('http://minio:9000/sekerchat/file.bin')).toBeNull();
  });

  it('rejects loopback URLs when the page is loaded through a LAN host', () => {
    expect(isLikelyBrowserReachableUrl('http://127.0.0.1:9000/sekerchat/file.bin', '198.51.100.185')).toBe(false);
    expect(isLikelyBrowserReachableUrl('http://localhost:9000/sekerchat/file.bin', '198.51.100.185')).toBe(false);
  });

  it('allows loopback URLs for loopback pages and normal DNS/IP URLs', () => {
    expect(isLikelyBrowserReachableUrl('http://127.0.0.1:9000/sekerchat/file.bin', 'localhost')).toBe(true);
    expect(isLikelyBrowserReachableUrl('https://im.example.com/minio/file.bin', 'localhost')).toBe(true);
    expect(isLikelyBrowserReachableUrl('http://192.0.2.10:9000/sekerchat/file.bin', 'localhost')).toBe(true);
  });
});
