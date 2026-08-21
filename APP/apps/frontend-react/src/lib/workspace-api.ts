import type { SystemConfig } from './system-config-api';
import type { GroupResponse } from './groups-api';
import type { MessageListResponse } from './messages-files-api';
import { apiBaseUrl, bearerHeader, fetchApi, parseResponse } from './api-core';
import type { WorkspaceBootstrapMode } from '@sekerchat/shared';

export interface WorkspaceBootstrapResponse {
  mode: WorkspaceBootstrapMode;
  systemConfig: SystemConfig;
  groups: GroupResponse[];
  dms: GroupResponse[];
  selectedGroupId: string;
  selectedGroup: GroupResponse | null;
  messages: MessageListResponse | null;
}

export async function fetchWorkspaceBootstrap(
  accessToken: string,
  options: {
    mode: WorkspaceBootstrapMode;
    groupId?: string;
    dmId?: string;
    messageLimit?: number;
  },
): Promise<WorkspaceBootstrapResponse> {
  const url = new URL(`${apiBaseUrl}/workspace/bootstrap`);
  url.searchParams.set('mode', options.mode);
  if (options.groupId) url.searchParams.set('groupId', options.groupId);
  if (options.dmId) url.searchParams.set('dmId', options.dmId);
  if (options.messageLimit !== undefined) {
    url.searchParams.set('messageLimit', String(options.messageLimit));
  }

  const response = await fetchApi(url.toString(), {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<WorkspaceBootstrapResponse>(response);
}
