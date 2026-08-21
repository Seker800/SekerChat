import { fetchApi, apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';
import type { components } from '@sekerchat/contracts/openapi';

export type MessageType = 'text' | 'image' | 'file' | 'system';
export type FileKind = 'image' | 'file';

export interface FileObjectResponse {
  id: string;
  groupId: string;
  originalName: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  createdAt: string;
  contentUrl: string;
  metadataUrl: string;
  uploaderId: string;
  kind: FileKind;
  thumbnailUrl: string | null;
}

export interface GroupArtifactResponse {
  id: string;
  groupId: string;
  uploaderId: string;
  originalName: string;
  storedName: string;
  relativePath: string;
  mimeType: string;
  size: number;
  sourceFileId?: string | null;
  createdAt: string;
  contentUrl: string;
  metadataUrl: string;
  fileExists?: boolean;
}

export interface GroupArtifactConfirmationResponse {
  isConfirmed: boolean;
  confirmedAt: string | null;
  confirmedByUserId: string | null;
  confirmedByDisplayName: string | null;
}

export interface AdminArtifactResponse extends GroupArtifactResponse {
  groupName: string;
  groupCategory: string;
  groupArchivedAt: string | null;
  groupWorkStatus: string | null;
  groupArtifactsConfirmed: boolean;
  uploaderEmail: string;
  uploaderDisplayName: string | null;
}

export interface MessageAttachmentResponse extends FileObjectResponse {
  fileId: string;
  isSharing?: boolean;
}

type ApiMessageResponse = components['schemas']['MessageResponseDto'];

export interface MessageResponse extends Omit<ApiMessageResponse, 'eventSequence'> {
  /** Present for server-confirmed messages; absent only on optimistic or legacy cached messages. */
  eventSequence?: string;
  /** Only set for optimistic (not yet confirmed) messages. */
  isSending?: boolean;
  /** Only set when an optimistic send failed. */
  sendError?: string;
  /** Stable render key for optimistic messages after server confirmation replaces their id. */
  clientKey?: string;
}

export interface MessageListResponse {
  groupId: string;
  items: MessageResponse[];
  nextCursor?: string | null;
}

export interface CreateMessageInput {
  type: MessageType;
  clientMessageId?: string;
  text?: string;
  replyToMessageId?: string;
  attachment?: {
    fileId: string;
  };
}

export async function listMessages(
  accessToken: string,
  groupId: string,
  options?: { cursor?: string; limit?: number },
): Promise<MessageListResponse> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.limit !== undefined) params.set('limit', String(options.limit));

  const query = params.toString();
  const response = await fetchApi(
    `${apiBaseUrl}/groups/${groupId}/messages${query ? `?${query}` : ''}`,
    {
      headers: bearerHeader(accessToken),
    },
  );

  return parseResponse<MessageListResponse>(response);
}

export async function createMessage(
  accessToken: string,
  groupId: string,
  input: CreateMessageInput,
): Promise<MessageResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/messages`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  return parseResponse<MessageResponse>(response);
}

export async function listGroupArtifacts(
  accessToken: string,
  groupId: string,
): Promise<GroupArtifactResponse[]> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/artifacts`, {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupArtifactResponse[]>(response);
}

export async function addFileToGroupArtifacts(
  accessToken: string,
  groupId: string,
  fileId: string,
): Promise<GroupArtifactResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/groups/${groupId}/artifacts/from-files/${fileId}`,
    {
      method: 'POST',
      headers: bearerHeader(accessToken),
    },
  );

  return parseResponse<GroupArtifactResponse>(response);
}

export async function deleteGroupArtifact(
  accessToken: string,
  groupId: string,
  artifactId: string,
): Promise<{ artifactId: string; deleted: boolean }> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/artifacts/${artifactId}`, {
    method: 'DELETE',
    headers: bearerHeader(accessToken),
  });

  return parseResponse<{ artifactId: string; deleted: boolean }>(response);
}

export async function confirmGroupArtifacts(
  accessToken: string,
  groupId: string,
): Promise<GroupArtifactConfirmationResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/artifacts/confirm`, {
    method: 'POST',
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupArtifactConfirmationResponse>(response);
}

export async function unlockGroupArtifacts(
  accessToken: string,
  groupId: string,
): Promise<GroupArtifactConfirmationResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/artifacts/confirm`, {
    method: 'DELETE',
    headers: bearerHeader(accessToken),
  });

  return parseResponse<GroupArtifactConfirmationResponse>(response);
}

export async function listAdminArtifacts(
  accessToken: string,
  filters?: {
    query?: string;
    groupId?: string;
    uploaderId?: string;
    groupWorkStatus?: string;
    packedState?: 'packed' | 'unpacked';
  },
): Promise<AdminArtifactResponse[]> {
  const params = new URLSearchParams();
  if (filters?.query) params.set('query', filters.query);
  if (filters?.groupId) params.set('groupId', filters.groupId);
  if (filters?.uploaderId) params.set('uploaderId', filters.uploaderId);
  if (filters?.groupWorkStatus) params.set('groupWorkStatus', filters.groupWorkStatus);
  if (filters?.packedState) params.set('packedState', filters.packedState);
  const query = params.toString();

  const response = await fetchApi(`${apiBaseUrl}/admin/artifacts${query ? `?${query}` : ''}`, {
    headers: bearerHeader(accessToken),
  });

  return parseResponse<AdminArtifactResponse[]>(response);
}

export async function deleteAdminArtifact(
  accessToken: string,
  artifactId: string,
): Promise<{ artifactId: string; deleted: boolean }> {
  const response = await fetchApi(`${apiBaseUrl}/admin/artifacts/${artifactId}`, {
    method: 'DELETE',
    headers: bearerHeader(accessToken),
  });

  return parseResponse<{ artifactId: string; deleted: boolean }>(response);
}

export async function editMessage(
  accessToken: string,
  groupId: string,
  messageId: string,
  text: string,
): Promise<MessageResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/messages/${messageId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ text }),
  });

  return parseResponse<MessageResponse>(response);
}

export async function revokeMessage(
  accessToken: string,
  groupId: string,
  messageId: string,
): Promise<MessageResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/messages/${messageId}/revoke`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });

  return parseResponse<MessageResponse>(response);
}
