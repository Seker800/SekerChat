import { fetchApi, apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';

export interface UserSummary {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  disabledAt?: string | null;
  dndUntil?: string | null;
  mustChangePassword?: boolean;
}

export function userDisplayName(user: { displayName?: string | null; email?: string | null }): string {
  if (user.displayName) return user.displayName;
  if (user.email && !user.email.endsWith('@deleted.local')) return user.email;
  return '已注销用户';
}

export async function fetchUsers(accessToken: string): Promise<UserSummary[]> {
  const response = await fetchApi(`${apiBaseUrl}/users`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<UserSummary[]>(response);
}

export async function updateUserRole(
  accessToken: string,
  userId: string,
  role: string,
): Promise<UserSummary> {
  const response = await fetchApi(`${apiBaseUrl}/users/${userId}/role`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ role }),
  });
  return parseResponse<UserSummary>(response);
}

export async function deleteUser(accessToken: string, userId: string): Promise<void> {
  const response = await fetchApi(`${apiBaseUrl}/users/${userId}`, {
    method: 'DELETE',
    headers: bearerHeader(accessToken),
  });
  await parseResponse<{ success: true }>(response);
}

export async function setUserDisabled(
  accessToken: string,
  userId: string,
  disabled: boolean,
): Promise<UserSummary> {
  const response = await fetchApi(`${apiBaseUrl}/users/${userId}/disabled`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ disabled }),
  });
  return parseResponse<UserSummary>(response);
}

export async function resetUserPassword(
  accessToken: string,
  userId: string,
  newPassword: string,
): Promise<void> {
  const response = await fetchApi(`${apiBaseUrl}/users/${userId}/password`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ newPassword }),
  });
  await parseResponse<{ success: true }>(response);
}
