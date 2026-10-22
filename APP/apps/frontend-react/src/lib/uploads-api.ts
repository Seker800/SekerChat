import { fetchApi, apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';
import { sendUploadRequest } from './upload-transport';
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
  signal?: AbortSignal,
): Promise<UploadSessionResponse> {
  const response = await fetchApi(`${apiBaseUrl}/uploads/initiate`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
    signal,
  });

  return parseResponse<UploadSessionResponse>(response);
}

export async function getUploadedParts(
  accessToken: string,
  uploadSessionId: string,
  signal?: AbortSignal,
): Promise<{
  uploadSessionId: string;
  partSizeBytes: number;
  parts: Array<{ partNumber: number; etag: string; size: number }>;
}> {
  const response = await fetchApi(`${apiBaseUrl}/uploads/${uploadSessionId}/parts`, {
    method: 'GET',
    headers: bearerHeader(accessToken),
    signal,
  });

  return parseResponse(response);
}

export async function uploadPart(
  accessToken: string,
  uploadSessionId: string,
  partNumber: number,
  blob: Blob,
  signal?: AbortSignal,
  onProgress?: (loaded: number) => void,
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
    { transport: (url, init) => sendUploadRequest(url, init, onProgress) },
  );

  try {
    return await parseResponse<{ uploadSessionId: string; partNumber: number; etag: string }>(response);
  } catch (error) {
    if (error instanceof Error) Object.assign(error, { status: response.status });
    throw error;
  }
}

export async function completeUpload(
  accessToken: string,
  uploadSessionId: string,
  parts: CompleteUploadPartInput[],
  signal?: AbortSignal,
): Promise<FinalizedUploadResponse> {
  try {
    const response = await fetchApi(
      `${apiBaseUrl}/uploads/${uploadSessionId}/complete`,
      {
        method: 'POST',
        headers: authHeaders(accessToken),
        body: JSON.stringify({ parts }),
        signal,
      },
      120_000,
    );
    return await parseResponse<FinalizedUploadResponse>(response);
  } catch (error) {
    if ((error instanceof Error || error instanceof DOMException) && error.name === 'TimeoutError') {
      throw new Error('完成上传超时，请稍后重试。');
    }
    throw error;
  }
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
