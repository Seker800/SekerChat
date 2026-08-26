import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchApi,
  authHeaders,
  bearerHeader,
  BROWSER_COOKIE_CREDENTIAL,
  downloadFile,
  isLikelyBrowserReachableUrl,
  parseResponse,
  registerAuthSessionController,
  resolveApiResourceUrl,
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

describe('resolveApiResourceUrl', () => {
  it('moves backend-authored API URLs onto the browser API base', () => {
    expect(
      resolveApiResourceUrl(
        'https://public.example.test/api/groups/group-1/files/file-1/content?download=1',
      ),
    ).toBe(`${window.location.origin}/api/groups/group-1/files/file-1/content?download=1`);
  });

  it('keeps malformed resource URLs unchanged', () => {
    expect(resolveApiResourceUrl('not a url')).toBe('not a url');
  });
});

describe('downloadFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the same-origin content route when the presigned host is not browser-reachable', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'http://minio:9000/sekerchat/file.bin' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    let clickedUrl = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedUrl = this.href;
    });

    await downloadFile(
      'https://public.example.test/api/groups/group-1/files/file-1/content',
      'file.bin',
      'token',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://public.example.test/api/groups/group-1/files/file-1/download-url',
      expect.objectContaining({ headers: { Authorization: 'Bearer token' } }),
    );
    expect(new URL(clickedUrl).origin).toBe(window.location.origin);
    expect(new URL(clickedUrl).pathname).toBe('/api/groups/group-1/files/file-1/content');
  });

  it('keeps a browser-reachable presigned URL on the direct download path', async () => {
    const presignedUrl = 'https://objects.example.test/sekerchat/file.bin?signature=valid';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ url: presignedUrl }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    let clickedUrl = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() {
      clickedUrl = this.href;
    });

    await downloadFile(
      `${window.location.origin}/api/groups/group-1/files/file-1/content`,
      'file.bin',
      'token',
    );

    expect(clickedUrl).toBe(presignedUrl);
  });

  it('rejects content URLs that cannot be mapped to the download-url contract', async () => {
    await expect(downloadFile('/api/files/file-1', 'file.bin', 'token')).rejects.toThrow(
      'Download URL format not supported',
    );
  });

  it('surfaces a failed download-url request without clicking an anchor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 503 }));
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

    await expect(
      downloadFile('/api/groups/group-1/files/file-1/content', 'file.bin', 'token'),
    ).rejects.toThrow('Download failed: 503');
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
