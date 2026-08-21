import { DEFAULT_UPLOAD_PART_SIZE_BYTES } from '@sekerchat/shared';
import {
  abortUpload,
  completeUpload,
  getUploadedParts,
  initiateUpload,
  uploadPart,
  type UploadKind,
} from './uploads-api';
import { mapWithConcurrency } from './async-pool';

export interface MultipartUploadProgress {
  loaded: number;
  total: number;
  percent: number;
  speedBytesPerSec: number;
}

export interface MultipartUploadResult {
  finalized: Awaited<ReturnType<typeof completeUpload>>;
}

export interface MultipartUploadOptions {
  subscriptionUsage?: 'INLINE_IMAGE' | 'DOWNLOADABLE_FILE';
}

/** Re-export shared constant for convenience (keeps callers stable). */
export const DEFAULT_PART_SIZE_BYTES = DEFAULT_UPLOAD_PART_SIZE_BYTES;
const DEFAULT_CONCURRENCY = 4;
const MAX_PART_RETRIES = 3;
const RETRY_BACKOFF_MS = [2000, 8000, 30000];

// ── session persistence (localStorage) ──

const SESSION_KEY_PREFIX = 'sekerchat:upload:';

function buildSessionKey(
  kind: string,
  targetId: string,
  fileName: string,
  fileSize: number,
  lastModified: number,
): string {
  return `${SESSION_KEY_PREFIX}${kind}:${targetId}:${fileName}:${fileSize}:${lastModified}`;
}

function persistSession(
  kind: string,
  targetId: string,
  fileName: string,
  fileSize: number,
  lastModified: number,
  sessionId: string,
): void {
  try {
    localStorage.setItem(
      buildSessionKey(kind, targetId, fileName, fileSize, lastModified),
      sessionId,
    );
  } catch {
    // quota exceeded — non-critical, upload can still succeed
  }
}

function removePersistedSession(
  kind: string,
  targetId: string,
  fileName: string,
  fileSize: number,
  lastModified: number,
): void {
  try {
    localStorage.removeItem(buildSessionKey(kind, targetId, fileName, fileSize, lastModified));
  } catch {
    // ignore
  }
}

function getPersistedSessionId(
  kind: string,
  targetId: string,
  fileName: string,
  fileSize: number,
  lastModified: number,
): string | null {
  try {
    return localStorage.getItem(buildSessionKey(kind, targetId, fileName, fileSize, lastModified));
  } catch {
    return null;
  }
}

// ── chunking ──

function createChunks(file: File, partSizeBytes: number) {
  const chunks: Array<{ partNumber: number; blob: Blob }> = [];
  let partNumber = 1;

  for (let start = 0; start < file.size; start += partSizeBytes) {
    chunks.push({
      partNumber,
      blob: file.slice(start, Math.min(start + partSizeBytes, file.size)),
    });
    partNumber += 1;
  }

  return chunks;
}

// ── same-origin upload proxy ──

// ── main ──

export async function uploadFileViaMultipart(
  accessToken: string,
  kind: UploadKind,
  targetId: string,
  file: File,
  onProgress: (progress: MultipartUploadProgress) => void,
  signal?: AbortSignal,
  options?: MultipartUploadOptions,
): Promise<MultipartUploadResult> {
  // ── resolve session (resume or new) ──
  let sessionId = '';
  let partSizeBytes = DEFAULT_PART_SIZE_BYTES;
  let baseCompletedParts: Array<{ partNumber: number; etag: string }> = [];

  const persistenceKind = options?.subscriptionUsage
    ? `${kind}:${options.subscriptionUsage}`
    : kind;
  const persistedId = getPersistedSessionId(
    persistenceKind,
    targetId,
    file.name,
    file.size,
    file.lastModified,
  );
  let resumed = false;

  if (persistedId) {
    try {
      const result = await getUploadedParts(accessToken, persistedId);
      sessionId = result.uploadSessionId;
      partSizeBytes = result.partSizeBytes || DEFAULT_PART_SIZE_BYTES;
      baseCompletedParts = result.parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag }));
      resumed = true;
    } catch {
      // Session expired / aborted — clean up and start fresh
      removePersistedSession(persistenceKind, targetId, file.name, file.size, file.lastModified);
    }
  }

  if (!resumed) {
    const session = await initiateUpload(accessToken, {
      kind,
      ...(kind === 'SUBSCRIPTION_ATTACHMENT'
        ? { postId: targetId }
        : kind === 'ALBUM_PHOTO'
          ? {}
          : { groupId: targetId }),
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      ...(kind === 'SUBSCRIPTION_ATTACHMENT' && options?.subscriptionUsage
        ? { subscriptionUsage: options.subscriptionUsage }
        : {}),
    });
    sessionId = session.id;
    partSizeBytes = session.partSizeBytes || DEFAULT_PART_SIZE_BYTES;
    persistSession(persistenceKind, targetId, file.name, file.size, file.lastModified, sessionId);
  }

  // ── chunk file and filter out completed parts ──
  const chunks = createChunks(file, partSizeBytes);
  const completedSet = new Set(baseCompletedParts.map((p) => p.partNumber));
  const pendingChunks = chunks.filter((c) => !completedSet.has(c.partNumber));

  // Calculate initial loaded bytes from already-uploaded parts
  let loadedBytes = 0;
  for (const p of baseCompletedParts) {
    const idx = p.partNumber - 1;
    loadedBytes += chunks[idx]?.blob.size ?? 0;
  }

  const completedParts = [...baseCompletedParts];
  let lastLoadedBytes = loadedBytes;
  let lastTs = Date.now();
  let speedBytesPerSec = 0;

  const updateProgress = (deltaBytes: number) => {
    loadedBytes += deltaBytes;
    const now = Date.now();
    const elapsed = now - lastTs;
    if (elapsed >= 500) {
      speedBytesPerSec = Math.max(
        0,
        Math.round(((loadedBytes - lastLoadedBytes) / elapsed) * 1000),
      );
      lastLoadedBytes = loadedBytes;
      lastTs = now;
    }
    onProgress({
      loaded: loadedBytes,
      total: file.size,
      percent: Math.min(100, Math.round((loadedBytes / file.size) * 100)),
      speedBytesPerSec,
    });
  };

  // Report initial progress (resumed state)
  updateProgress(0);

  // ── upload pending chunks through the app API ──
  if (pendingChunks.length > 0) {
    try {
      await mapWithConcurrency(pendingChunks, DEFAULT_CONCURRENCY, async (chunk) => {
        if (signal?.aborted) {
          throw new DOMException('Upload aborted', 'AbortError');
        }

        let lastError: Error | undefined;
        for (let attempt = 0; attempt <= MAX_PART_RETRIES; attempt++) {
          try {
            const uploaded = await uploadPart(
              accessToken,
              sessionId,
              chunk.partNumber,
              chunk.blob,
              signal,
            );
            completedParts.push({ partNumber: chunk.partNumber, etag: uploaded.etag });
            updateProgress(chunk.blob.size);
            lastError = undefined;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < MAX_PART_RETRIES && !signal?.aborted) {
              // Backoff: 2s, 8s, 30s
              await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt]));
            }
          }
        }

        if (lastError) throw lastError;
      });
    } catch (error) {
      // If user cancelled — abort and clean up. Otherwise leave session for resume.
      if (signal?.aborted) {
        try {
          await abortUpload(accessToken, sessionId);
        } catch {
          // Best-effort
        }
        removePersistedSession(persistenceKind, targetId, file.name, file.size, file.lastModified);
      }
      throw error;
    }
  }

  // ── finalize ──
  const finalized = await completeUpload(accessToken, sessionId, completedParts);
  removePersistedSession(persistenceKind, targetId, file.name, file.size, file.lastModified);
  return { finalized };
}
