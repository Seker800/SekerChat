import { fetchApi, apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';
import type { components } from '@sekerchat/contracts/openapi';

type ApiSchemas = components['schemas'];
export type GroupMemberResponse = ApiSchemas['GroupMemberResponseDto'];
export type GroupWorkStateSummaryResponse = ApiSchemas['GroupWorkStateSummaryResponseDto'];
export type GroupArtifactConfirmationSummaryResponse =
  ApiSchemas['GroupArtifactConfirmationResponseDto'];
export type UserOptionResponse = ApiSchemas['UserOptionResponseDto'];
export type GroupMessagePreview = ApiSchemas['GroupMessagePreviewResponseDto'];
export type GroupResponse = ApiSchemas['GroupResponseDto'];
export type LeaveGroupResponse = ApiSchemas['LeaveGroupResponseDto'];
export type ServerResponse = ApiSchemas['ServerResponseDto'];
export type ArchiveServerResponse = ApiSchemas['ArchiveServerResponseDto'];

export type ResetCategoryResponse = ApiSchemas['ResetCategoryResponseDto'];
export type ManageableCategoryResponse = ApiSchemas['ManageableCategoryResponseDto'];
export type RenameCategoryResponse = ApiSchemas['RenameCategoryResponseDto'];

export type AdminGroupDiscoveryScope = 'all' | 'archived' | 'former';

export type AdminDiscoverableGroupResponse = ApiSchemas['AdminDiscoverableGroupResponseDto'];

export async function listGroups(accessToken: string): Promise<GroupResponse[]> {
  const response = await fetchApi(`${apiBaseUrl}/groups`, {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupResponse[]>(response);
}

export async function listInvitableUsers(
  accessToken: string,
  groupId: string,
): Promise<UserOptionResponse[]> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/invite-candidates`, {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<UserOptionResponse[]>(response);
}

export async function createGroup(
  accessToken: string,
  input: {
    name: string;
    category?: string;
    serverId?: string;
  },
): Promise<GroupResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  return parseResponse<GroupResponse>(response);
}

export async function inviteGroupMember(
  accessToken: string,
  groupId: string,
  email: string,
): Promise<GroupResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/members`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ email }),
  });

  return parseResponse<GroupResponse>(response);
}

export async function removeGroupMember(
  accessToken: string,
  groupId: string,
  memberUserId: string,
): Promise<GroupResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/members/${memberUserId}`, {
    method: 'DELETE',
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupResponse>(response);
}

export async function archiveGroup(
  accessToken: string,
  groupId: string,
  archive = true,
): Promise<GroupResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/archive`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ archive }),
  });

  return parseResponse<GroupResponse>(response);
}

export type ArchiveCategoryResponse = ApiSchemas['ArchiveCategoryResponseDto'];

export async function archiveCategory(
  accessToken: string,
  category: string,
  archive = true,
): Promise<ArchiveCategoryResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/admin/categories/archive`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ category, archive }),
  });

  return parseResponse<ArchiveCategoryResponse>(response);
}

export async function archiveServer(
  accessToken: string,
  serverId: string,
  archive = true,
): Promise<ArchiveServerResponse> {
  const response = await fetchApi(`${apiBaseUrl}/servers/${encodeURIComponent(serverId)}/archive`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ archive }),
  });
  return parseResponse<ArchiveServerResponse>(response);
}

export async function updateGroup(
  accessToken: string,
  groupId: string,
  input: {
    name?: string;
    category?: string;
    serverId?: string;
  },
): Promise<GroupResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  return parseResponse<GroupResponse>(response);
}

export async function renameCategory(
  accessToken: string,
  input: {
    from: string;
    to: string;
  },
): Promise<RenameCategoryResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/admin/categories`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  return parseResponse<RenameCategoryResponse>(response);
}

export async function renameServer(
  accessToken: string,
  serverId: string,
  name: string,
): Promise<ServerResponse> {
  const response = await fetchApi(`${apiBaseUrl}/servers/${encodeURIComponent(serverId)}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ name }),
  });
  return parseResponse<ServerResponse>(response);
}

export async function getGroup(accessToken: string, groupId: string): Promise<GroupResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}`, {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupResponse>(response);
}

export async function markGroupRead(accessToken: string, groupId: string): Promise<void> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${encodeURIComponent(groupId)}/mark-read`, {
    method: 'POST',
    headers: bearerHeader(accessToken),
  });

  await parseResponse<ApiSchemas['MarkGroupReadResponseDto']>(response);
}

export async function advanceReadCursor(
  accessToken: string,
  groupId: string,
  eventSequence: string,
): Promise<void> {
  const response = await fetchApi(
    `${apiBaseUrl}/groups/${encodeURIComponent(groupId)}/read-cursor`,
    {
      method: 'PATCH',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ eventSequence }),
    },
  );
  await parseResponse(response);
}

export async function listAdminDiscoverableGroups(
  accessToken: string,
  options?: {
    scope?: AdminGroupDiscoveryScope;
    search?: string;
    category?: string;
    serverId?: string;
  },
): Promise<AdminDiscoverableGroupResponse[]> {
  const url = new URL(`${apiBaseUrl}/groups/admin/discovery`);

  if (options?.scope) {
    url.searchParams.set('scope', options.scope);
  }

  if (options?.search?.trim()) {
    url.searchParams.set('search', options.search.trim());
  }

  if (options?.category?.trim()) {
    url.searchParams.set('category', options.category.trim());
  }

  if (options?.serverId?.trim()) {
    url.searchParams.set('serverId', options.serverId.trim());
  }

  const response = await fetchApi(url.toString(), {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<AdminDiscoverableGroupResponse[]>(response);
}

export async function leaveGroup(accessToken: string, groupId: string): Promise<void> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/leave`, {
    method: 'DELETE',
    headers: bearerHeader(accessToken),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const message = body
      ? `退出频道失败 (${response.status})`
      : `退出频道失败 (${response.status})`;
    throw new Error(message);
  }
}

export async function adminJoinGroup(accessToken: string, groupId: string): Promise<GroupResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/admin/join`, {
    method: 'POST',
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupResponse>(response);
}

export async function uploadUserAvatar(
  accessToken: string,
  file: File | Blob,
): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append('file', file, 'avatar.png');

  const response = await fetchApi(`${apiBaseUrl}/avatars/users/me`, {
    method: 'POST',
    headers: bearerHeader(accessToken),
    body: formData,
  });

  return parseResponse<{ avatarUrl: string }>(response);
}

export async function uploadServerAvatar(
  accessToken: string,
  serverId: string,
  file: Blob,
): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append('file', file, 'avatar.png');

  const response = await fetchApi(
    `${apiBaseUrl}/avatars/servers/by-id/${encodeURIComponent(serverId)}`,
    {
      method: 'POST',
      headers: bearerHeader(accessToken),
      body: formData,
    },
  );

  return parseResponse<{ avatarUrl: string }>(response);
}

export async function deleteServerAvatar(
  accessToken: string,
  serverId: string,
): Promise<{ avatarUrl: null }> {
  const response = await fetchApi(
    `${apiBaseUrl}/avatars/servers/by-id/${encodeURIComponent(serverId)}`,
    {
      method: 'DELETE',
      headers: bearerHeader(accessToken),
    },
  );

  return parseResponse<{ avatarUrl: null }>(response);
}
