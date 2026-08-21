import {
  apiBaseUrl,
  authHeaders,
  bearerHeader,
  fetchApi,
  parseResponse,
  resolveBrowserReachableUrl,
} from './api-core';
import type { components } from '@sekerchat/contracts/openapi';
import { createClientMessageId } from './client-message-id';

type SubscriptionApiSchemas = components['schemas'];

export type SubscriptionPostStatus = 'DRAFT' | 'PUBLISHED' | 'WITHDRAWN';

export type SubscriptionAttachment = SubscriptionApiSchemas['SubscriptionAttachmentResponseDto'];

export type SubscriptionPostSummary = SubscriptionApiSchemas['SubscriptionPostSummaryResponseDto'];
export type SubscriptionPost = SubscriptionApiSchemas['SubscriptionPostResponseDto'];
export type SubscriptionConfirmations =
  SubscriptionApiSchemas['SubscriptionConfirmationsResponseDto'];

export interface SubscriptionPostInput {
  title: string;
  body: string;
  tags: string[];
}

export async function listSubscriptionPosts(
  accessToken: string,
): Promise<{ items: SubscriptionPostSummary[]; pendingConfirmationCount: number }> {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse(response);
}

export async function getSubscriptionPost(
  accessToken: string,
  postId: string,
): Promise<SubscriptionPost> {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions/${postId}`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse(response);
}

export async function listManageableSubscriptionPosts(
  accessToken: string,
): Promise<{ items: SubscriptionPost[] }> {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions?manage=true`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse(response);
}

export async function getSubscriptionSummary(
  accessToken: string,
): Promise<{ pendingConfirmationCount: number }> {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions/summary`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse(response);
}

export async function createSubscriptionDraft(
  accessToken: string,
  input: SubscriptionPostInput,
): Promise<SubscriptionPost> {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseResponse(response);
}

export async function updateSubscriptionPost(
  accessToken: string,
  postId: string,
  input: SubscriptionPostInput,
): Promise<SubscriptionPost> {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions/${postId}`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(input),
  });
  return parseResponse(response);
}

async function postAction(
  accessToken: string,
  postId: string,
  action: 'publish' | 'withdraw' | 'pin',
  body?: unknown,
): Promise<SubscriptionPost> {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions/${postId}/${action}`, {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parseResponse(response);
}

export const publishSubscriptionPost = (accessToken: string, postId: string) =>
  postAction(accessToken, postId, 'publish');
export const withdrawSubscriptionPost = (accessToken: string, postId: string) =>
  postAction(accessToken, postId, 'withdraw');
export const setSubscriptionPostPinned = (accessToken: string, postId: string, pinned: boolean) =>
  postAction(accessToken, postId, 'pin', { pinned });

export async function deleteSubscriptionPost(accessToken: string, postId: string) {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions/${postId}`, {
    method: 'DELETE',
    headers: bearerHeader(accessToken),
  });
  return parseResponse<{ postId: string; deleted: boolean }>(response);
}

export async function confirmSubscriptionPost(
  accessToken: string,
  postId: string,
) {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions/${postId}/confirmation`, {
    method: 'PUT',
    headers: {
      ...authHeaders(accessToken),
      'Idempotency-Key': createClientMessageId(),
    },
  });
  return parseResponse<SubscriptionApiSchemas['SubscriptionConfirmationResponseDto']>(response);
}

export async function getSubscriptionConfirmations(
  accessToken: string,
  postId: string,
): Promise<SubscriptionConfirmations> {
  const response = await fetchApi(`${apiBaseUrl}/subscriptions/${postId}/confirmations`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse(response);
}

export function subscriptionAttachmentContentUrl(attachmentId: string): string {
  return `${apiBaseUrl}/subscriptions/attachments/${attachmentId}/content`;
}

export async function getSubscriptionAttachmentDownloadUrl(
  accessToken: string,
  attachmentId: string,
): Promise<{ url: string; originalName: string; mimeType: string; size: number }> {
  const response = await fetchApi(
    `${apiBaseUrl}/subscriptions/attachments/${attachmentId}/download-url`,
    { headers: bearerHeader(accessToken) },
  );
  const result = await parseResponse<{
    url: string;
    originalName: string;
    mimeType: string;
    size: number;
  }>(response);
  return {
    ...result,
    url: resolveBrowserReachableUrl(result.url) ?? result.url,
  };
}

export async function getSubscriptionAttachmentViewUrl(
  accessToken: string,
  attachmentId: string,
): Promise<{ url: string; originalName: string; mimeType: string; size: number }> {
  const response = await fetchApi(
    `${apiBaseUrl}/subscriptions/attachments/${attachmentId}/view-url`,
    { headers: bearerHeader(accessToken) },
  );
  const result = await parseResponse<{
    url: string;
    originalName: string;
    mimeType: string;
    size: number;
  }>(response);
  return {
    ...result,
    url: resolveBrowserReachableUrl(result.url) ?? result.url,
  };
}
