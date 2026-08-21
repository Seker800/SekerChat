import {
  bearerHeader,
  BROWSER_COOKIE_CREDENTIAL,
  fetchApi,
  parseResponse,
  resolveBrowserReachableUrl,
} from '../../../lib/api-core';

const DEFAULT_MAX_ENTRIES = 256;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;
const ORIGINAL_URL_EXPIRY_SAFETY_MS = 5 * 60 * 1000;

type MediaFetcher = (url: string, init?: RequestInit) => Promise<Response>;

interface ThumbnailEntry {
  invalidated: boolean;
  key: string;
  pending?: Promise<ThumbnailEntry>;
  pendingController?: AbortController;
  pendingConsumers: number;
  src?: string;
  size: number;
  references: number;
  lastUsed: number;
}

interface OriginalUrlEntry {
  pending?: Promise<OriginalUrlEntry>;
  pendingController?: AbortController;
  url?: string;
  expiresAt: number;
}

interface RepositoryOptions {
  fetcher?: MediaFetcher;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  now?: () => number;
  maxEntries?: number;
  maxBytes?: number;
}

interface ThumbnailRequest {
  viewerId: string;
  accessToken: string;
  url: string;
  signal?: AbortSignal;
}

interface OriginalUrlRequest {
  viewerId: string;
  accessToken: string;
  contentUrl: string;
}

export interface ThumbnailLease {
  src: string;
  release: () => void;
}

function mediaKey(viewerId: string, kind: 'thumbnail' | 'original', url: string) {
  return `${viewerId}\u0000${kind}\u0000${url}`;
}

function viewUrlFromContentUrl(contentUrl: string): string {
  const viewUrl = contentUrl.replace(/\/content(\?.*)?$/, (_, query: string | undefined) => `/view-url${query ?? ''}`);
  if (viewUrl === contentUrl) {
    throw new Error('Image content URL format is not supported.');
  }
  return viewUrl;
}

export function createPrivateMediaRepository(options: RepositoryOptions = {}) {
  const fetcher = options.fetcher ?? fetchApi;
  const createObjectUrl = options.createObjectUrl ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectUrl = options.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
  const now = options.now ?? Date.now;
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const thumbnails = new Map<string, ThumbnailEntry>();
  const originals = new Map<string, OriginalUrlEntry>();

  function totalThumbnailBytes() {
    let total = 0;
    for (const entry of thumbnails.values()) {
      total += entry.size;
    }
    return total;
  }

  function evictReleasedThumbnails() {
    let bytes = totalThumbnailBytes();
    if (thumbnails.size <= maxEntries && bytes <= maxBytes) return;

    const candidates = [...thumbnails.values()]
      .filter((entry) => entry.references === 0 && entry.src)
      .sort((left, right) => left.lastUsed - right.lastUsed);

    for (const entry of candidates) {
      if (thumbnails.size <= maxEntries && bytes <= maxBytes) break;
      thumbnails.delete(entry.key);
      bytes -= entry.size;
      revokeObjectUrl(entry.src!);
    }
  }

  function waitForPendingThumbnail(entry: ThumbnailEntry, signal?: AbortSignal) {
    const pending = entry.pending;
    if (!pending) return Promise.resolve(entry);
    entry.pendingConsumers += 1;

    return new Promise<ThumbnailEntry>((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) return false;
        settled = true;
        signal?.removeEventListener('abort', handleAbort);
        entry.pendingConsumers = Math.max(0, entry.pendingConsumers - 1);
        return true;
      };
      const handleAbort = () => {
        if (!finish()) return;
        if (entry.pending && entry.pendingConsumers === 0) entry.pendingController?.abort();
        reject(new DOMException('Aborted', 'AbortError'));
      };

      if (signal?.aborted) {
        handleAbort();
        return;
      }
      signal?.addEventListener('abort', handleAbort, { once: true });
      pending.then(
        (resolved) => {
          if (finish()) resolve(resolved);
        },
        (error) => {
          if (finish()) reject(error);
        },
      );
    });
  }

  async function acquireThumbnail(request: ThumbnailRequest): Promise<ThumbnailLease> {
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const key = mediaKey(request.viewerId, 'thumbnail', request.url);
    let entry = thumbnails.get(key);

    if (!entry) {
      entry = {
        invalidated: false,
        key,
        pendingConsumers: 0,
        size: 0,
        references: 0,
        lastUsed: now(),
      };
      const target = entry;
      const pendingController = new AbortController();
      target.pendingController = pendingController;
      target.pending = (async () => {
        const response = await fetcher(request.url, {
          cache: 'default',
          headers: bearerHeader(request.accessToken),
          signal: pendingController.signal,
        });
        if (!response.ok) {
          throw new Error(`Thumbnail request failed: ${response.status}`);
        }
        const blob = await response.blob();
        if (target.invalidated) throw new DOMException('Aborted', 'AbortError');
        target.src = createObjectUrl(blob);
        target.size = blob.size;
        target.lastUsed = now();
        target.pending = undefined;
        target.pendingController = undefined;
        return target;
      })().catch((error) => {
        if (thumbnails.get(key) === target) thumbnails.delete(key);
        target.pending = undefined;
        target.pendingController = undefined;
        throw error;
      });
      thumbnails.set(key, target);
    }

    const resolved = entry.pending
      ? await waitForPendingThumbnail(entry, request.signal)
      : entry;
    if (request.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (!resolved.src) {
      throw new Error('Thumbnail response produced no object URL.');
    }
    resolved.references += 1;
    resolved.lastUsed = now();
    evictReleasedThumbnails();
    let released = false;

    return {
      src: resolved.src,
      release() {
        if (released) return;
        released = true;
        resolved.references = Math.max(0, resolved.references - 1);
        resolved.lastUsed = now();
        evictReleasedThumbnails();
      },
    };
  }

  async function resolveOriginalUrl(request: OriginalUrlRequest): Promise<string> {
    if (request.accessToken === BROWSER_COOKIE_CREDENTIAL) {
      return request.contentUrl;
    }

    const key = mediaKey(request.viewerId, 'original', request.contentUrl);
    const existing = originals.get(key);
    if (existing?.pending) {
      return (await existing.pending).url!;
    }
    if (existing?.url && existing.expiresAt - ORIGINAL_URL_EXPIRY_SAFETY_MS > now()) {
      return existing.url;
    }

    originals.delete(key);
    const pendingController = new AbortController();
    const entry: OriginalUrlEntry = { expiresAt: 0, pendingController };
    entry.pending = (async () => {
      const response = await fetcher(viewUrlFromContentUrl(request.contentUrl), {
        headers: bearerHeader(request.accessToken),
        signal: pendingController.signal,
      });
      const payload = await parseResponse<{ url: string; expiresAt?: string }>(response);
      const browserUrl = resolveBrowserReachableUrl(payload.url);
      if (!browserUrl) {
        throw new Error('Presigned URL is not browser-reachable.');
      }
      const parsedExpiry = payload.expiresAt ? Date.parse(payload.expiresAt) : NaN;
      entry.url = browserUrl;
      entry.expiresAt = Number.isFinite(parsedExpiry) ? parsedExpiry : now() + 55 * 60 * 1000;
      entry.pending = undefined;
      entry.pendingController = undefined;
      return entry;
    })().catch((error) => {
      if (originals.get(key) === entry) originals.delete(key);
      entry.pending = undefined;
      entry.pendingController = undefined;
      throw error;
    });
    originals.set(key, entry);
    return (await entry.pending).url!;
  }

  function clear() {
    for (const entry of thumbnails.values()) {
      entry.invalidated = true;
      entry.pendingController?.abort();
      if (entry.src) revokeObjectUrl(entry.src);
    }
    for (const entry of originals.values()) entry.pendingController?.abort();
    thumbnails.clear();
    originals.clear();
  }

  return {
    acquireThumbnail,
    resolveOriginalUrl,
    clear,
    getStats: () => ({ entries: thumbnails.size, bytes: totalThumbnailBytes() }),
  };
}

export const privateMediaRepository = createPrivateMediaRepository();

export function clearPrivateMediaCache() {
  privateMediaRepository.clear();
}
