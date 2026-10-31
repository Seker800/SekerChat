import { apiBaseUrl, authHeaders } from './api-core';
import type { components } from '@sekerchat/contracts/openapi';

// The DTO is shared through generated OpenAPI, not through backend implementation imports.
export type DownloadReport = components['schemas']['DownloadLogDto'];
type Fetcher = (url: string, init?: RequestInit, timeoutMs?: number) => Promise<Response>;
interface Options {
  accessToken?: string;
  report?: (record: DownloadReport) => void | Promise<void>;
  now?: () => number;
}

function sendReport(record: DownloadReport, accessToken?: string): Promise<void> {
  // Small, best-effort requests. No auth refresh or persistent offline queue after logout.
  return fetch(`${apiBaseUrl}/download-logs`, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: authHeaders(accessToken),
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(5000),
  }).then(
    () => undefined,
    () => undefined,
  );
}

function cacheStatus(url: string, started: number): DownloadReport['cacheStatus'] {
  const absolute = new URL(url, window.location.href);
  if (
    absolute.origin !== window.location.origin ||
    typeof performance.getEntriesByName !== 'function'
  )
    return 'unknown';
  const entries = performance.getEntriesByName(
    absolute.href,
    'resource',
  ) as PerformanceResourceTiming[];
  const entry = entries.filter((item) => item.startTime >= started).at(-1);
  if (!entry || entry.decodedBodySize <= 0) return 'unknown';
  return entry.transferSize === 0 ? 'browser_cache' : 'network';
}

/** Observe only real content fetches. The repository still owns caching, deduplication and cancellation. */
export async function fetchLoggedDownload(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  options: Options = {},
): Promise<Response> {
  const pathname = new URL(url, window.location.href).pathname;
  const match =
    /\/api\/(?:groups\/[^/]+\/(files|artifacts)|album\/(photos)|subscriptions\/(attachments))\/([a-zA-Z0-9_-]{1,128})\/content$/.exec(
      pathname,
    );
  if (!match || init.signal?.aborted) {
    return fetcher(url, init, timeoutMs);
  }
  const resourceKind: DownloadReport['resourceKind'] =
    match[1] === 'files'
      ? 'file'
      : match[1] === 'artifacts'
        ? 'artifact'
        : match[2]
          ? 'album_photo'
          : 'article_attachment';
  const resourceId = match[4];
  const now = options.now ?? (() => performance.now());
  const started = now();
  const downloadId = crypto.randomUUID();
  let bytes = 0;
  let expectedBytes: number | null = null;
  let firstByteMs: number | null = null;
  let lastByteMs: number | null = null;
  let maxGapMs = 0;
  let finished = false;
  const report =
    options.report ?? ((record: DownloadReport) => sendReport(record, options.accessToken));
  const emit = (event: DownloadReport['event'], errorCode: DownloadReport['errorCode'] = null) => {
    const elapsedMs = Math.max(0, Math.round(now() - started));
    try {
      void Promise.resolve(
        report({
          downloadId,
          resourceKind,
          resourceId,
          event,
          bytes,
          expectedBytes,
          elapsedMs,
          firstByteMs,
          maxGapMs: Math.max(maxGapMs, lastByteMs === null ? 0 : elapsedMs - lastByteMs),
          cacheStatus: event === 'completed' ? cacheStatus(url, started) : 'unknown',
          errorCode,
        }),
      ).catch(() => undefined);
    } catch {
      /* Diagnostics must never alter download results. */
    }
  };
  const finish = (
    event: DownloadReport['event'],
    errorCode: DownloadReport['errorCode'] = null,
  ) => {
    if (finished) return;
    finished = true;
    clearInterval(timer);
    emit(event, errorCode);
  };
  const fail = (error: unknown) => {
    const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : '';
    finish(
      name === 'AbortError' ? 'cancelled' : 'failed',
      name === 'TimeoutError' ? 'timeout' : name === 'AbortError' ? 'aborted' : 'network',
    );
  };
  emit('started');
  const timer = setInterval(() => emit('progress'), 15_000);
  const headers = new Headers(init.headers);
  headers.set('X-Download-Id', downloadId);
  try {
    const response = await fetcher(url, { ...init, headers }, timeoutMs);
    const length = response.headers.get('content-length');
    const encoding = response.headers.get('content-encoding');
    expectedBytes =
      length !== null &&
      Number.isSafeInteger(Number(length)) &&
      Number(length) >= 0 &&
      (!encoding || encoding === 'identity')
        ? Number(length)
        : null;
    if (!response.ok) {
      finish('failed', 'http');
      return response;
    }
    if (!response.body) {
      finish('completed');
      return response;
    }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>(
      {
        async pull(output) {
          try {
            const result = await reader.read();
            if (result.done) {
              finish('completed');
              output.close();
              return;
            }
            const elapsed = Math.max(0, Math.round(now() - started));
            if (result.value.byteLength > 0) {
              firstByteMs ??= elapsed;
              if (lastByteMs !== null) maxGapMs = Math.max(maxGapMs, elapsed - lastByteMs);
              lastByteMs = elapsed;
              bytes += result.value.byteLength;
            }
            output.enqueue(result.value);
          } catch (error) {
            fail(error);
            output.error(error);
          }
        },
        async cancel(reason) {
          finish('cancelled', 'aborted');
          await reader.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    fail(error);
    throw error;
  }
}
