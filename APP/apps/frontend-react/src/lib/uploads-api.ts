import { fetchApi, apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';
import type { components } from '@sekerchat/contracts/openapi';

export type UploadKind = 'CHAT_ATTACHMENT' | 'ARTIFACT' | 'SUBSCRIPTION_ATTACHMENT' | 'ALBUM_PHOTO';

export type UploadSessionResponse = components['schemas']['UploadSessionResponseDto'];

export interface InitiateUploadInput {
  kind: UploadKind;
  groupId?: string;
  postId?: string;
  fileName: string;
  mimeType: string;
  size: number;
  subscriptionUsage?: 'INLINE_IMAGE' | 'DOWNLOADABLE_FILE';
}

export interface CompleteUploadPartInput {
  partNumber: number;
  etag: string;
}

export type FinalizedChatAttachmentResponse =
  components['schemas']['FinalizedChatAttachmentResponseDto'];
export type FinalizedArtifactResponse = components['schemas']['FinalizedArtifactResponseDto'];
export type FinalizedSubscriptionAttachmentResponse =
  components['schemas']['FinalizedSubscriptionAttachmentResponseDto'];
export type FinalizedAlbumPhotoResponse = components['schemas']['FinalizedAlbumPhotoResponseDto'];
export type FinalizedUploadResponse =
  | FinalizedChatAttachmentResponse
  | FinalizedArtifactResponse
  | FinalizedSubscriptionAttachmentResponse
  | FinalizedAlbumPhotoResponse;

export async function initiateUpload(
  accessToken: string,
  input: InitiateUploadInput,
): Promise<UploadSessionResponse> {
  const response = await fetchApi(`${apiBaseUrl}/uploads/initiate`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });

  return parseResponse<UploadSessionResponse>(response);
}

export async function getUploadedParts(
  accessToken: string,
  uploadSessionId: string,
): Promise<{
  uploadSessionId: string;
  partSizeBytes: number;
  parts: Array<{ partNumber: number; etag: string; size: number }>;
}> {
  const response = await fetchApi(`${apiBaseUrl}/uploads/${uploadSessionId}/parts`, {
    method: 'GET',
    headers: bearerHeader(accessToken),
  });

  return parseResponse(response);
}

export async function uploadPart(
  accessToken: string,
  uploadSessionId: string,
  partNumber: number,
  blob: Blob,
  signal?: AbortSignal,
): Promise<{ uploadSessionId: string; partNumber: number; etag: string }> {
  const response = await fetchApi(
    `${apiBaseUrl}/uploads/${uploadSessionId}/parts/${partNumber}`,
    {
      method: 'PUT',
      headers: {
        ...bearerHeader(accessToken),
        'Content-Type': 'application/octet-stream',
      },
      body: blob,
      signal,
    },
    55 * 60 * 1000,
  );

  return parseResponse<{ uploadSessionId: string; partNumber: number; etag: string }>(response);
}

export async function completeUpload(
  accessToken: string,
  uploadSessionId: string,
  parts: CompleteUploadPartInput[],
): Promise<FinalizedUploadResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/uploads/${uploadSessionId}/complete`,
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({ parts }),
    },
    55 * 60 * 1000,
  );

  return parseResponse<FinalizedUploadResponse>(response);
}

export async function abortUpload(
  accessToken: string,
  uploadSessionId: string,
): Promise<{ uploadSessionId: string; aborted: boolean }> {
  const response = await fetchApi(`${apiBaseUrl}/uploads/${uploadSessionId}`, {
    method: 'DELETE',
    headers: bearerHeader(accessToken),
  });

  return parseResponse<{ uploadSessionId: string; aborted: boolean }>(response);
}

export type FileDownloadUrlResponse = components['schemas']['FileDownloadUrlResponseDto'];

export async function getFileDownloadUrl(
  accessToken: string,
  groupId: string,
  fileId: string,
): Promise<FileDownloadUrlResponse> {
  const response = await fetchApi(`${apiBaseUrl}/groups/${groupId}/files/${fileId}/download-url`, {
    method: 'GET',
    headers: bearerHeader(accessToken),
  });

  return parseResponse<FileDownloadUrlResponse>(response);
}
