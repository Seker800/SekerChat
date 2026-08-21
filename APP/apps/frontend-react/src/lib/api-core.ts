const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const BROWSER_COOKIE_CREDENTIAL = 'browser-cookie-session';

interface FetchApiInternalOptions {
  authRetryAttempted?: boolean;
  disableAuthRetry?: boolean;
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
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const externalSignal = init?.signal;

  function onExternalAbort() {
    controller.abort();
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
      clearTimeout(timer);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    const response = await fetch(url, { credentials: 'include', ...init, signal: controller.signal });

    if (
      response.status === 401
      && !internalOptions?.authRetryAttempted
      && !internalOptions?.disableAuthRetry
      && !isAuthRefreshRequest(url)
    ) {
      const refreshed = await refreshBrowserSession();
      if (refreshed) {
        return fetchApi(
          url,
          init,
          timeoutMs,
          { authRetryAttempted: true },
        );
      }
    }

    return response;
  } finally {
    clearTimeout(timer);
    if (externalSignal && !externalSignal.aborted) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
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
    if (Array.isArray(message) && message.length > 0) {
      throw new Error(message.join('; '));
    }
    if (typeof message === 'string' && message.trim()) {
      throw new Error(message.trim());
    }
    if (response.status === 401) {
      throw new Error('登录状态已失效，请重新登录。');
    }
    const code = typeof errorPayload.code === 'string' && errorPayload.code.trim()
      ? errorPayload.code.trim()
      : `HTTP_${response.status}`;
    const requestId = typeof errorPayload.requestId === 'string' && errorPayload.requestId.trim()
      ? errorPayload.requestId.trim()
      : response.headers.get('x-request-id')?.trim();
    throw new Error(requestId ? `${code} · requestId: ${requestId}` : `Request failed (${response.status}) · ${code}`);
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
 * Download a file via presigned S3 URL.
 *
 * Gets a presigned download URL from the backend, then triggers a native
 * browser download — no blob buffering, no JS fallbacks.
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

  // Trigger native browser download via a hidden anchor element.
  // window.location.href would work for same-origin but is unreliable
  // for cross-origin presigned URLs (different port).
  const anchor = document.createElement('a');
  anchor.style.display = 'none';
  anchor.href = presignedUrl;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}
