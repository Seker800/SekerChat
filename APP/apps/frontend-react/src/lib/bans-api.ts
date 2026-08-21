import { fetchApi, apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';

export interface BanEntry {
  id: string;
  email: string;
  ip: string;
  failedAttempts: number;
  lastFailedAt: string | null;
  lockedUntil: string | null;
  lockoutCount: number;
  blacklistedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BlacklistResponse {
  items: BanEntry[];
  total: number;
}

export async function fetchBlacklist(
  accessToken: string,
  params?: { search?: string; page?: number; pageSize?: number },
): Promise<BlacklistResponse> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  const qs = query.toString();
  const response = await fetchApi(`${apiBaseUrl}/admin/bans${qs ? `?${qs}` : ''}`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<BlacklistResponse>(response);
}

export async function unbanLoginRisk(
  accessToken: string,
  id: string,
  note?: string,
): Promise<BanEntry> {
  const response = await fetchApi(`${apiBaseUrl}/admin/bans/${id}/unban`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ note }),
  });
  return parseResponse<BanEntry>(response);
}
