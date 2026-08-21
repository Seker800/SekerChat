import { afterEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_COOKIE_CREDENTIAL } from '../../../lib/api-core';
import { createPrivateMediaRepository } from './privateMediaRepository';

function thumbnailResponse(body = 'thumbnail-bytes') {
  return new Response(new Blob([body], { type: 'image/jpeg' }), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg' },
  });
}

describe('private media repository', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deduplicates thumbnail downloads across component remounts', async () => {
    const fetcher = vi.fn(async () => thumbnailResponse());
    const createObjectUrl = vi.fn(() => 'blob:thumbnail-1');
    const revokeObjectUrl = vi.fn();
    const repository = createPrivateMediaRepository({ fetcher, createObjectUrl, revokeObjectUrl });

    const first = await repository.acquireThumbnail({
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
    });
    first.release();
    const second = await repository.acquireThumbnail({
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
    });

    expect(first.src).toBe('blob:thumbnail-1');
    expect(second.src).toBe('blob:thumbnail-1');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      'http://localhost/api/groups/group-1/files/file-1/thumbnail',
      expect.objectContaining({
        cache: 'default',
        headers: { Authorization: 'Bearer token-1' },
      }),
    );
    second.release();
    repository.clear();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:thumbnail-1');
  });

  it('never reuses private thumbnails across users', async () => {
    const fetcher = vi.fn(async () => thumbnailResponse());
    let objectUrlSequence = 0;
    const repository = createPrivateMediaRepository({
      fetcher,
      createObjectUrl: () => `blob:thumbnail-${++objectUrlSequence}`,
      revokeObjectUrl: vi.fn(),
    });

    const first = await repository.acquireThumbnail({
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
    });
    const second = await repository.acquireThumbnail({
      viewerId: 'user-2',
      accessToken: 'token-2',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
    });

    expect(first.src).not.toBe(second.src);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not revoke an oversized thumbnail until its active lease is released', async () => {
    const revokeObjectUrl = vi.fn();
    const repository = createPrivateMediaRepository({
      fetcher: vi.fn(async () => thumbnailResponse('larger-than-budget')),
      createObjectUrl: () => 'blob:oversized-thumbnail',
      revokeObjectUrl,
      maxBytes: 1,
    });

    const lease = await repository.acquireThumbnail({
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
    });

    expect(lease.src).toBe('blob:oversized-thumbnail');
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    lease.release();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:oversized-thumbnail');
  });

  it('evicts the least recently used released thumbnails by entry count', async () => {
    let objectUrlSequence = 0;
    const revokeObjectUrl = vi.fn();
    const repository = createPrivateMediaRepository({
      fetcher: vi.fn(async () => thumbnailResponse()),
      createObjectUrl: () => `blob:thumbnail-${++objectUrlSequence}`,
      revokeObjectUrl,
      maxEntries: 2,
    });
    const request = (fileId: string) => ({
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: `http://localhost/api/groups/group-1/files/${fileId}/thumbnail`,
    });

    (await repository.acquireThumbnail(request('file-1'))).release();
    (await repository.acquireThumbnail(request('file-2'))).release();
    (await repository.acquireThumbnail(request('file-3'))).release();

    expect(repository.getStats().entries).toBe(2);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:thumbnail-1');
  });

  it('evicts released thumbnails when their byte budget is exceeded', async () => {
    const payload = new Blob(['12345678'], { type: 'image/jpeg' });
    const revokeObjectUrl = vi.fn();
    const repository = createPrivateMediaRepository({
      fetcher: vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => payload,
      }) as Response),
      createObjectUrl: vi.fn()
        .mockReturnValueOnce('blob:thumbnail-1')
        .mockReturnValueOnce('blob:thumbnail-2'),
      revokeObjectUrl,
      maxBytes: payload.size + 4,
    });
    const request = (fileId: string) => ({
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: `http://localhost/api/groups/group-1/files/${fileId}/thumbnail`,
    });

    (await repository.acquireThumbnail(request('file-1'))).release();
    const second = await repository.acquireThumbnail(request('file-2'));

    expect(repository.getStats()).toEqual({ entries: 1, bytes: payload.size });
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:thumbnail-1');
    second.release();
  });

  it('aborts a pending thumbnail download after its last consumer leaves', async () => {
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const repository = createPrivateMediaRepository({
      fetcher,
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
    });
    const controller = new AbortController();
    const pending = repository.acquireThumbnail({
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
      signal: controller.signal,
    });

    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('keeps a shared pending thumbnail download alive for remaining consumers', async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetcher = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      resolveFetch = resolve;
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const repository = createPrivateMediaRepository({
      fetcher,
      createObjectUrl: () => 'blob:shared-thumbnail',
      revokeObjectUrl: vi.fn(),
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const request = {
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
    };
    const first = repository.acquireThumbnail({ ...request, signal: firstController.signal });
    const second = repository.acquireThumbnail({ ...request, signal: secondController.signal });

    firstController.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    resolveFetch?.(thumbnailResponse());
    const lease = await second;

    expect(lease.src).toBe('blob:shared-thumbnail');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('aborts pending private thumbnail downloads when the repository is cleared', () => {
    let fetchSignal: AbortSignal | undefined;
    const repository = createPrivateMediaRepository({
      fetcher: vi.fn((_url: string, init?: RequestInit) => {
        fetchSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }),
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
    });
    void repository.acquireThumbnail({
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
    });

    repository.clear();

    expect(fetchSignal?.aborted).toBe(true);
    expect(repository.getStats()).toEqual({ entries: 0, bytes: 0 });
  });

  it('aborts pending private original URL requests when the repository is cleared', () => {
    let fetchSignal: AbortSignal | undefined;
    const repository = createPrivateMediaRepository({
      fetcher: vi.fn((_url: string, init?: RequestInit) => {
        fetchSignal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined);
      }),
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
    });
    void repository.resolveOriginalUrl({
      viewerId: 'user-1',
      accessToken: 'token-1',
      contentUrl: 'http://localhost/api/groups/group-1/files/file-1/content',
    });

    repository.clear();

    expect(fetchSignal?.aborted).toBe(true);
  });

  it('uses the same-origin protected content URL for browser cookie sessions', async () => {
    const fetcher = vi.fn();
    const repository = createPrivateMediaRepository({
      fetcher,
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
    });
    const contentUrl = 'https://chat.example.test/api/groups/group-1/files/file-1/content';

    await expect(repository.resolveOriginalUrl({
      viewerId: 'user-1',
      accessToken: BROWSER_COOKIE_CREDENTIAL,
      contentUrl,
    })).resolves.toBe(contentUrl);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not let a cleared request delete a newer cache entry with the same key', async () => {
    let rejectFirst: ((error: unknown) => void) | undefined;
    const fetcher = vi.fn()
      .mockImplementationOnce(() => new Promise<Response>((_resolve, reject) => {
        rejectFirst = reject;
      }))
      .mockResolvedValueOnce(thumbnailResponse('new-thumbnail'));
    const repository = createPrivateMediaRepository({
      fetcher,
      createObjectUrl: vi.fn(() => 'blob:new-thumbnail'),
      revokeObjectUrl: vi.fn(),
    });
    const request = {
      viewerId: 'user-1',
      accessToken: 'token-1',
      url: 'http://localhost/api/groups/group-1/files/file-1/thumbnail',
    };
    const staleRequest = repository.acquireThumbnail(request);
    repository.clear();
    const freshLease = await repository.acquireThumbnail(request);

    rejectFirst?.(new DOMException('Aborted', 'AbortError'));
    await expect(staleRequest).rejects.toMatchObject({ name: 'AbortError' });
    freshLease.release();
    const reusedLease = await repository.acquireThumbnail(request);

    expect(reusedLease.src).toBe('blob:new-thumbnail');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('deduplicates original view-url requests until the expiry safety window', async () => {
    let now = Date.parse('2026-08-10T08:00:00.000Z');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      url: 'https://media.example/original.jpg?signature=one',
      expiresAt: '2026-08-10T09:00:00.000Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    const repository = createPrivateMediaRepository({
      fetcher,
      createObjectUrl: vi.fn(),
      revokeObjectUrl: vi.fn(),
      now: () => now,
    });

    const input = {
      viewerId: 'user-1',
      accessToken: 'token-1',
      contentUrl: 'http://localhost/api/groups/group-1/files/file-1/content',
    };
    expect(await repository.resolveOriginalUrl(input)).toContain('signature=one');
    expect(await repository.resolveOriginalUrl(input)).toContain('signature=one');
    expect(fetcher).toHaveBeenCalledTimes(1);

    now = Date.parse('2026-08-10T08:56:00.000Z');
    await repository.resolveOriginalUrl(input);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
