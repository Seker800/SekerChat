import type { components } from '@sekerchat/contracts/openapi';
import { apiBaseUrl, bearerHeader, fetchApi, parseResponse } from './api-core';

type ApiSchemas = components['schemas'];

export type GroupMessageActivity = ApiSchemas['GroupMessageActivityResponseDto'];

export async function fetchGroupMessageActivity(
  accessToken: string,
  groupId: string,
): Promise<GroupMessageActivity> {
  const response = await fetchApi(
    `${apiBaseUrl}/groups/${encodeURIComponent(groupId)}/messages/activity`,
    { headers: bearerHeader(accessToken) },
  );
  return parseResponse<GroupMessageActivity>(response);
}
