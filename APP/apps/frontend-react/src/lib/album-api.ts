import { apiBaseUrl, authHeaders, bearerHeader, fetchApi, parseResponse } from './api-core';
import { uploadFileViaMultipart, type MultipartUploadProgress } from './multipart-upload';
export interface AlbumPhoto {
  id: string;
  mediaType?: 'image' | 'video';
  mimeType?: string;
  durationMs?: number | null;
  width: number;
  height: number;
  createdAt: string;
  thumbnailUrl: string | null;
  contentUrl: string;
}
export interface AlbumTag {
  id: string;
  name: string;
  normalizedName: string;
  photoCount: number;
}
export interface AlbumUpdateStatus {
  hasUpdates: boolean;
}
export async function getAlbumUpdateStatus(accessToken: string) {
  const response = await fetchApi(`${apiBaseUrl}/album/update-status`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<AlbumUpdateStatus>(response);
}
export async function markAlbumViewed(accessToken: string) {
  const response = await fetchApi(`${apiBaseUrl}/album/viewed`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseResponse<AlbumUpdateStatus>(response);
}
export async function listAlbumPhotos(
  accessToken: string,
  options: { cursor?: string; tag?: string; limit?: number } = {},
) {
  const q = new URLSearchParams();
  if (options.cursor) q.set('cursor', options.cursor);
  if (options.tag) q.set('tag', options.tag);
  if (options.limit) q.set('limit', String(options.limit));
  const response = await fetchApi(`${apiBaseUrl}/album/photos?${q}`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<{ items: AlbumPhoto[]; nextCursor: string | null }>(response);
}
export async function listAlbumTags(accessToken: string) {
  const response = await fetchApi(`${apiBaseUrl}/album/tags`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<AlbumTag[]>(response);
}
export async function uploadAlbumPhoto(
  accessToken: string,
  file: File,
  onProgress: (value: MultipartUploadProgress) => void,
) {
  const result = await uploadFileViaMultipart(
    accessToken,
    'ALBUM_PHOTO',
    'global-album',
    file,
    onProgress,
  );
  if (result.finalized.kind !== 'ALBUM_PHOTO') throw new Error('相册上传结果无效');
  return result.finalized.photo;
}
export async function deleteAlbumPhotos(accessToken: string, photoIds: string[]) {
  const response = await fetchApi(`${apiBaseUrl}/album/photos/batch-delete`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({ photoIds }),
  });
  return parseResponse<{ requestedCount: number; deletedCount: number }>(response);
}
