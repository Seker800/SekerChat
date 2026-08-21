import { fetchApi,  apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';

export type GroupWorkStatus = string;

export interface GroupWorkStateResponse {
  id: string | null;
  groupId: string;
  status: GroupWorkStatus;
  reason: string | null;
  sourceMessageIds: string[];
  updatedByActorType: string | null;
  updatedByActorId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function getGroupWorkState(accessToken: string, groupId: string): Promise<GroupWorkStateResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/work-state`, {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupWorkStateResponse>(response);
}

export interface GroupWorkStateHistoryEntry {
  id: string;
  groupId: string;
  fromStatus: string | null;
  toStatus: string;
  reason: string | null;
  sourceMessageIds: string[];
  actorType: string;
  actorId: string;
  createdAt: string;
  actor: { id: string; email: string; displayName: string | null } | null;
}

export async function setGroupWorkState(
  accessToken: string,
  groupId: string,
  input: {
    status: GroupWorkStatus;
    reason?: string;
    sourceMessageIds?: string[];
  },
): Promise<GroupWorkStateResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/work-state`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  return parseResponse<GroupWorkStateResponse>(response);
}
