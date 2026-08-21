import { apiBaseUrl, authHeaders, fetchApi, parseResponse } from './api-core';
import type { ManagedFileShare } from '../components/workspace/FileShareDialog';

function endpoint(groupId: string, fileId: string): string {
  return `${apiBaseUrl}/groups/${encodeURIComponent(groupId)}/files/${encodeURIComponent(fileId)}/share`;
}

function normalize(share: Omit<ManagedFileShare, 'status'> & { status: ManagedFileShare['status'] | null }): ManagedFileShare {
  return { ...share, status: share.status ?? 'DRAFT' };
}

export async function getFileShare(accessToken: string, groupId: string, fileId: string): Promise<ManagedFileShare> {
  return normalize(await parseResponse(await fetchApi(endpoint(groupId, fileId), { headers: authHeaders(accessToken) })));
}

export async function saveFileShare(accessToken: string, groupId: string, fileId: string, input: { password: string; expiresAt: string }): Promise<ManagedFileShare> {
  return normalize(await parseResponse(await fetchApi(endpoint(groupId, fileId), {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  })));
}

export async function rotateFileShare(
  accessToken: string,
  groupId: string,
  fileId: string,
  input: { password: string },
): Promise<ManagedFileShare> {
  return normalize(
    await parseResponse(
      await fetchApi(`${endpoint(groupId, fileId)}/rotate`, {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify(input),
      }),
    ),
  );
}

export async function revokeFileShare(accessToken: string, groupId: string, fileId: string): Promise<ManagedFileShare> {
  return normalize(await parseResponse(await fetchApi(endpoint(groupId, fileId), { method: 'DELETE', headers: authHeaders(accessToken) })));
}
