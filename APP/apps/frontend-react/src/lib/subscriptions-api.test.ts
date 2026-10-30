import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmSubscriptionPost, recordSubscriptionView } from './subscriptions-api';

describe('confirmSubscriptionPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records an authenticated view without supplying a viewer identity', async () => {
    const result = { postId: 'post/1', viewCount: 1, viewers: [] };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    expect(await recordSubscriptionView('token', 'post/1')).toEqual(result);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toContain('/subscriptions/post%2F1/view');
    expect(options?.method).toBe('PUT');
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer token');
    expect(options?.body).toBeUndefined();
  });

  it('creates an idempotency key when crypto.randomUUID is unavailable', async () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.set(Array.from({ length: bytes.length }, (_, index) => index));
        return bytes;
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          isConfirmed: true,
          confirmedAt: '2026-08-12T00:00:00.000Z',
          pendingConfirmationCount: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await confirmSubscriptionPost('token', 'post-1');

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toContain('/subscriptions/post-1/confirmation');
    expect(request?.[1]?.method).toBe('PUT');
    expect(new Headers(request?.[1]?.headers).get('Idempotency-Key')).toBe(
      '00010203-0405-4607-8809-0a0b0c0d0e0f',
    );
  });
});
