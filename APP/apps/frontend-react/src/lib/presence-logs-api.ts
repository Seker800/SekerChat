import { fetchApi,  apiBaseUrl, bearerHeader } from './api-core';

export interface PresenceLogItem {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  event: 'online' | 'offline' | 'dnd_on' | 'dnd_off';
  isOnline: boolean;
  isDnd: boolean;
  createdAt: string;
}

export interface PresenceLogResponse {
  items: PresenceLogItem[];
  total: number;
  limit: number;
  offset: number;
}

export async function fetchPresenceLogs(
  accessToken: string,
  options?: { limit?: number; offset?: number; userId?: string; event?: string },
): Promise<PresenceLogResponse> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.userId) params.set('userId', options.userId);
  if (options?.event) params.set('event', options.event);

  const qs = params.toString();
  const res = await fetchApi(`${apiBaseUrl}/presence-logs${qs ? `?${qs}` : ''}`, {
    headers: bearerHeader(accessToken),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<PresenceLogResponse>;
}
