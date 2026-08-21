import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmSubscriptionPost } from './subscriptions-api';

describe('confirmSubscriptionPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
