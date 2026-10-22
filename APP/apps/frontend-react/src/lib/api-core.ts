const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const BROWSER_COOKIE_CREDENTIAL = 'browser-cookie-session';

interface FetchApiInternalOptions {
  authRetryAttempted?: boolean;
  disableAuthRetry?: boolean;
  transport?: (url: string, init: RequestInit) => Promise<Response>;
}

interface AuthSessionController {
  refreshSession: () => Promise<boolean>;
}

let authSessionController: AuthSessionController | null = null;
let authRefreshInFlight: Promise<boolean> | null = null;

export function registerAuthSessionController(controller: AuthSessionController | null): void {
  authSessionController = controller;
}

function isAuthRefreshRequest(url: string): boolean {
  try {
    const pathname = new URL(url, window.location.origin).pathname.replace(/\/$/, '');
    return /\/auth\/(?:browser\/)?refresh$/.test(pathname);
  } catch {
    return false;
  }
}

async function refreshBrowserSession(): Promise<boolean> {
  if (!authSessionController) {
    return false;
  }

  if (authRefreshInFlight) {
    return authRefreshInFlight;
  }

  authRefreshInFlight = authSessionController
    .refreshSession()
    .finally(() => {
      authRefreshInFlight = null;
    });

  return authRefreshInFlight;
}

export async function fetchApi(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
  internalOptions?: FetchApiInternalOptions,
): Promise<Response> {
  const controller = new AbortController();
  const externalSignal = init?.signal;
  const timer = setTimeout(() => controller.abort(new DOMException('请求超时，请重试。', 'TimeoutError')), timeoutMs);
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  const cleanup = () => {
    clearTimeout(timer);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  };
  if (externalSignal?.aborted) onExternalAbort();
  else externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  let bodyOwnsCleanup = false;
  try {
    controller.signal.throwIfAborted();
    const transport = internalOptions?.transport ?? fetch;
    const response = await transport(url, { credentials: 'include', ...init, signal: controller.signal });
    controller.signal.throwIfAborted();
    if (response.status === 401 && !internalOptions?.authRetryAttempted &&
      !internalOptions?.disableAuthRetry && !isAuthRefreshRequest(url)) {
      const refreshed = await refreshBrowserSession();
      controller.signal.throwIfAborted();
      if (refreshed) {
        await response.body?.cancel();
        cleanup();
        return fetchApi(url, init, timeoutMs, { ...internalOptions, authRetryAttempted: true });
      }
    }
    if (!response.body) return response;
    const reader = response.body.getReader();
    let onAbort: () => void;
    const finish = () => {
      cleanup();
      controller.signal.removeEventListener('abort', onAbort);
    };
    const body = new ReadableStream<Uint8Array>({
      start(output) {
        onAbort = () => {
          output.error(controller.signal.reason);
          void reader.cancel(controller.signal.reason).catch(() => undefined);
          finish();
        };
        controller.signal.addEventListener('abort', onAbort, { once: true });
        if (controller.signal.aborted) onAbort();
      },
      async pull(output) {
        try {
          const result = await reader.read();
          if (result.done) { finish(); output.close(); }
          else output.enqueue(result.value);
        } catch (error) { finish(); output.error(error); }
      },
      async cancel(reason) { finish(); await reader.cancel(reason); },
    });
    bodyOwnsCleanup = true;
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  } catch (error) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    if (!bodyOwnsCleanup) cleanup();
  }
}

export function resolveApiBaseUrl(): string {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '/api';
  return new URL(configuredBaseUrl, window.location.origin).toString().replace(/\/$/, '');
}

export const apiBaseUrl = resolveApiBaseUrl();

export function resolveApiResourceUrl(resourceUrl: string): string {
  try {
    const resolvedBaseUrl = new URL(apiBaseUrl);
    const originalUrl = new URL(resourceUrl);
    return new URL(`${originalUrl.pathname}${originalUrl.search}`, resolvedBaseUrl).toString();
  } catch {
    return resourceUrl;
  }
}

function getRealtimeBaseUrl(): string {
  const realtimeUrl = new URL(apiBaseUrl);
  realtimeUrl.protocol = realtimeUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  realtimeUrl.pathname = '/realtime';
  realtimeUrl.search = '';
  realtimeUrl.hash = '';
  return realtimeUrl.toString();
}

export async function parseResponse<T>(response: Response): Promise<T> {
  const raw = await response.text();
  const trimmed = raw.trim();
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  let payload: unknown = {};

  if (trimmed) {
    if (contentType.includes('application/json')) {
      payload = JSON.parse(trimmed);
    } else {
      payload = { message: trimmed };
    }
  }

  if (!response.ok) {
    const errorPayload = payload as { message?: unknown; code?: unknown; requestId?: unknown };
    const message = errorPayload.message;
    const code = typeof errorPayload.code === 'string' && errorPayload.code.trim()
      ? errorPayload.code.trim() : `HTTP_${response.status}`;
    const requestId = typeof errorPayload.requestId === 'string' && errorPayload.requestId.trim()
      ? errorPayload.requestId.trim() : response.headers.get('x-request-id')?.trim();
    const publicMessage = Array.isArray(message) && message.length ? message.join('; ')
      : typeof message === 'string' && message.trim() ? message.trim()
      : response.status === 401 ? '登录状态已失效，请重新登录。'
      : requestId ? `${code} · requestId: ${requestId}` : `Request failed (${response.status}) · ${code}`;
    throw Object.assign(new Error(publicMessage), { status: response.status, code, requestId });
  }

  return payload as T;
}

export function authHeaders(accessToken?: string): HeadersInit {
  return accessToken?.trim() && accessToken !== BROWSER_COOKIE_CREDENTIAL
    ? { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

export function bearerHeader(accessToken?: string): HeadersInit {
  return accessToken?.trim() && accessToken !== BROWSER_COOKIE_CREDENTIAL
    ? { Authorization: `Bearer ${accessToken}` }
    : {};
}

export function createRealtimeUrl(): string {
  const realtimeUrl = new URL(getRealtimeBaseUrl());
  return realtimeUrl.toString();
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
}

export function isLikelyBrowserReachableUrl(rawUrl: string, pageHostname = window.location.hostname): boolean {
  try {
    const targetUrl = new URL(rawUrl);
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return false;
    }

    if (isLoopbackHostname(targetUrl.hostname) && !isLoopbackHostname(pageHostname)) {
      return false;
    }

    return targetUrl.hostname.includes('.') || targetUrl.hostname === pageHostname || isLoopbackHostname(targetUrl.hostname);
  } catch {
    return false;
  }
}

export function resolveBrowserReachableUrl(rawUrl: string): string | null {
  return isLikelyBrowserReachableUrl(rawUrl) ? rawUrl : null;
}

/**
 * Download a file through a browser-reachable URL.
 *
 * Uses the presigned object-storage URL when the browser can reach it. If the
 * backend signed an internal-only endpoint, the same-origin content route
 * keeps downloads working across LAN and public entry points.
 */
export async function downloadFile(
  url: string,
  _filename: string,
  accessToken: string,
): Promise<void> {
  const presignUrl = url.replace(/\/content(\?.*)?$/, (_, qs) => `/download-url${qs ?? ''}`);
  if (presignUrl === url) {
    throw new Error('Download URL format not supported');
  }

  const presignResponse = await fetchApi(
    presignUrl,
    { headers: bearerHeader(accessToken) },
  );

  if (!presignResponse.ok) {
    throw new Error(`Download failed: ${presignResponse.status}`);
  }

  const { url: presignedUrl } = await parseResponse<{ url: string }>(presignResponse);
  const browserDownloadUrl = resolveBrowserReachableUrl(presignedUrl)
    ?? resolveApiResourceUrl(url);

  // Trigger native browser download via a hidden anchor element.
  // window.location.href would work for same-origin but is unreliable
  // for cross-origin presigned URLs (different port).
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = browserDownloadUrl;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
