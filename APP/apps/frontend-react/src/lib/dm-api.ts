import { fetchApi,  apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';
import type { GroupResponse } from './groups-api';
import type { UserOptionResponse } from './groups-api';

export async function listDMs(accessToken: string): Promise<GroupResponse[]> {
  const response = await fetchApi(`${apiBaseUrl}/dm`, {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupResponse[]>(response);
}

export async function createOrGetDM(
  accessToken: string,
  targetUserId: string,
): Promise<GroupResponse> {
  const response = await fetchApi(`${apiBaseUrl}/dm`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ targetUserId }),
  });

  return parseResponse<GroupResponse>(response);
}

export async function listDMCandidates(accessToken: string): Promise<UserOptionResponse[]> {
  try {
    const response = await fetchApi(`${apiBaseUrl}/users/dm-candidates`, {
      headers: bearerHeader(accessToken),
    });

    return await parseResponse<UserOptionResponse[]>(response);
  } catch (error) {
    if (error instanceof Error && /404|Cannot GET|Not Found/i.test(error.message)) {
      return [];
    }
    throw error;
  }
}
