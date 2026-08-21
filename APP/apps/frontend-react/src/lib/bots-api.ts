import { fetchApi,  apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';

export interface BotConfig {
  gatewayUrl?: string;
  authToken?: string;
  openclawAgentId?: string;
  allowedUserIds?: string[];
  chatEnabled?: boolean;
  systemPrompt?: string;
}

export interface BotSummary {
  id: string;
  email: string;
  displayName: string | null;
  avatarStorageKey: string | null;
  role: string;
  kind: 'AGENT_BOT' | 'UNKNOWN';
  botConfig: BotConfig | null;
  createdAt: string;
}

export type BotKind = BotSummary['kind'];

export interface CreateBotRequest {
  email: string;
  displayName: string;
  botConfig?: BotConfig;
}

export interface UpdateBotRequest {
  displayName?: string;
  botConfig?: BotConfig;
}

export async function fetchBots(accessToken: string): Promise<BotSummary[]> {
  const response = await fetchApi(`${apiBaseUrl}/admin/bots`, {
    headers: authHeaders(accessToken),
  });
  return parseResponse<BotSummary[]>(response);
}

export async function createBot(accessToken: string, body: CreateBotRequest): Promise<BotSummary> {
  const response = await fetchApi(`${apiBaseUrl}/admin/bots`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
  return parseResponse<BotSummary>(response);
}

export async function updateBot(accessToken: string, botId: string, body: UpdateBotRequest): Promise<BotSummary> {
  const response = await fetchApi(`${apiBaseUrl}/admin/bots/${botId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
  return parseResponse<BotSummary>(response);
}

export async function deleteBot(accessToken: string, botId: string): Promise<{ success: boolean }> {
  const response = await fetchApi(`${apiBaseUrl}/admin/bots/${botId}`, {
    method: 'DELETE',
    headers: authHeaders(accessToken),
  });
  return parseResponse<{ success: boolean }>(response);
}

export async function uploadBotAvatar(accessToken: string, botId: string, file: Blob): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  formData.append('file', file, 'avatar.png');
  const response = await fetchApi(`${apiBaseUrl}/admin/bots/${botId}/avatar`, {
    method: 'POST',
    headers: bearerHeader(accessToken),
    body: formData,
  });
  return parseResponse<{ avatarUrl: string }>(response);
}

export function buildBotAvatarUrl(botId: string): string {
  return `${apiBaseUrl}/avatars/users/${botId}/content`;
}
