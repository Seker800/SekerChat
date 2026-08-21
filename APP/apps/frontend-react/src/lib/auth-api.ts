import { fetchApi, apiBaseUrl, authHeaders, parseResponse } from './api-core';
import type { components } from '@sekerchat/contracts/openapi';

type AuthApiSchemas = components['schemas'];

export type RequestCodeResponse = AuthApiSchemas['RequestCodeResponseDto'];

export function createOidcLoginUrl(): string {
  return `${apiBaseUrl}/auth/browser/oidc/login`;
}

type AuthUserApiResponse = AuthApiSchemas['AuthUserResponseDto'];
export interface SessionUser extends AuthUserApiResponse {
  avatarUrl: string | null;
  dndUntil: string | null;
}

type BrowserSessionApiResponse = AuthApiSchemas['BrowserSessionResponseDto'];
export interface SessionResponse extends Omit<BrowserSessionApiResponse, 'user'> {
  user: SessionUser;
}

export interface CurrentUserResponse extends SessionUser {
  createdAt: string;
}

export interface CurrentUserCapabilitiesResponse {
  permissions: Array<{ key: string; label?: string; description?: string }>;
}

export async function register(
  email: string,
  password: string,
  displayName?: string,
): Promise<SessionResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/auth/browser/register`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, displayName }),
    },
    undefined,
    { disableAuthRetry: true },
  );

  return parseResponse<SessionResponse>(response);
}

export async function login(email: string, password: string): Promise<SessionResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/auth/browser/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    },
    undefined,
    { disableAuthRetry: true },
  );

  return parseResponse<SessionResponse>(response);
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<SessionResponse> {
  const response = await fetchApi(`${apiBaseUrl}/auth/browser/me/password`, {
    method: 'PATCH',
    headers: authHeaders(),
    credentials: 'include',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  return parseResponse<SessionResponse>(response);
}

export async function requestCode(email: string): Promise<RequestCodeResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/auth/browser/request-code`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email }),
    },
    undefined,
    { disableAuthRetry: true },
  );

  return parseResponse<RequestCodeResponse>(response);
}

export async function verifyCode(email: string, code: string): Promise<SessionResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/auth/browser/verify-code`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, code }),
    },
    undefined,
    { disableAuthRetry: true },
  );

  return parseResponse<SessionResponse>(response);
}

export async function refreshSession(): Promise<SessionResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/auth/browser/refresh`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    },
    undefined,
    { disableAuthRetry: true },
  );

  return parseResponse<SessionResponse>(response);
}

export async function logout(): Promise<void> {
  await fetchApi(
    `${apiBaseUrl}/auth/browser/logout`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: '{}',
    },
    undefined,
    { disableAuthRetry: true },
  );
}

export async function getCurrentUser(): Promise<CurrentUserResponse> {
  const response = await fetchApi(
    `${apiBaseUrl}/users/me`,
    {
      credentials: 'include',
    },
    undefined,
    { disableAuthRetry: true },
  );

  return parseResponse<CurrentUserResponse>(response);
}

export async function getCurrentUserCapabilities(
  accessToken?: string,
): Promise<CurrentUserCapabilitiesResponse> {
  const response = await fetchApi(`${apiBaseUrl}/users/me/capabilities`, {
    credentials: 'include',
    headers: accessToken ? authHeaders(accessToken) : undefined,
  });
  return parseResponse<CurrentUserCapabilitiesResponse>(response);
}

export interface UpdateProfileResponse {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarStorageKey: string | null;
  role: string;
  createdAt: string;
  dndUntil?: string | null;
}

export async function updateUserProfile(
  accessToken: string,
  body: { displayName?: string; dndUntil?: string | null },
): Promise<UpdateProfileResponse> {
  const response = await fetchApi(`${apiBaseUrl}/users/me`, {
    method: 'PATCH',
    credentials: 'include',
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });

  return parseResponse<UpdateProfileResponse>(response);
}
