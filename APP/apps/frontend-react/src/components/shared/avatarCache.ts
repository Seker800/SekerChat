import { bearerHeader, fetchApi } from '../../lib/api-core';

interface AvatarEntry {
  src?: string;
  pending?: Promise<string>;
  refs: number;
  bytes: number;
  lastUsed: number;
}

export interface AvatarLease {
  src: string;
  release: () => void;
}

const MAX_ENTRIES = 64;
const MAX_BYTES = 8 * 1024 * 1024;
const cache = new Map<string, AvatarEntry>();
let generation = 0;

function cacheKey(viewerKey: string, url: string): string {
  return `${viewerKey}\u0000${url}`;
}

function totalBytes(): number {
  let total = 0;
  for (const entry of cache.values()) total += entry.bytes;
  return total;
}

function evictReleased(): void {
  if (cache.size <= MAX_ENTRIES && totalBytes() <= MAX_BYTES) return;
  const candidates = [...cache.entries()]
    .filter(([, entry]) => entry.refs === 0 && entry.src)
    .sort((left, right) => left[1].lastUsed - right[1].lastUsed);
  for (const [key, entry] of candidates) {
    if (cache.size <= MAX_ENTRIES && totalBytes() <= MAX_BYTES) break;
    cache.delete(key);
    if (entry.src) URL.revokeObjectURL(entry.src);
  }
}

function leaseFor(entry: AvatarEntry): AvatarLease {
  entry.refs += 1;
  entry.lastUsed = Date.now();
  let released = false;
  return {
    src: entry.src!,
    release() {
      if (released) return;
      released = true;
      entry.refs = Math.max(0, entry.refs - 1);
      entry.lastUsed = Date.now();
      evictReleased();
    },
  };
}

/**
 * Share one avatar download and one object URL across every mounted copy of the
 * same versioned URL. The previous per-component fetch downloaded the same image
 * once per message row; 5 distinct avatars produced 511 requests in 24h.
 */
export async function acquireAvatar(url: string, viewerKey: string): Promise<AvatarLease> {
  const key = cacheKey(viewerKey, url);
  const existing = cache.get(key);

  if (existing?.src) return leaseFor(existing);
  if (existing?.pending) {
    await existing.pending;
    const resolved = cache.get(key);
    if (resolved?.src) return leaseFor(resolved);
    throw new Error('Avatar cache entry disappeared.');
  }

  const entry: AvatarEntry = { refs: 0, bytes: 0, lastUsed: Date.now() };
  const startGeneration = generation;
  cache.set(key, entry);
  entry.pending = (async () => {
    const response = await fetchApi(url, {
      headers: bearerHeader(viewerKey),
      cache: 'default',
    });
    if (!response.ok) {
      throw new Error(`Avatar request failed (${response.status}).`);
    }
    const blob = await response.blob();
    const src = URL.createObjectURL(blob);
    if (generation !== startGeneration) {
      URL.revokeObjectURL(src);
      throw new DOMException('Avatar cache was cleared.', 'AbortError');
    }
    entry.src = src;
    entry.bytes = blob.size;
    entry.lastUsed = Date.now();
    entry.pending = undefined;
    evictReleased();
    return src;
  })().catch((error) => {
    if (cache.get(key) === entry) cache.delete(key);
    entry.pending = undefined;
    throw error;
  });

  await entry.pending;
  if (!entry.src) throw new Error('Avatar response produced no object URL.');
  return leaseFor(entry);
}

export function getCachedAvatar(url: string, viewerKey: string): string | null {
  return cache.get(cacheKey(viewerKey, url))?.src ?? null;
}

export function clearAvatarCache(): void {
  generation += 1;
  for (const entry of cache.values()) {
    if (entry.src) URL.revokeObjectURL(entry.src);
  }
  cache.clear();
}

export function getAvatarCacheStats(): { entries: number; bytes: number } {
  return { entries: cache.size, bytes: totalBytes() };
}
