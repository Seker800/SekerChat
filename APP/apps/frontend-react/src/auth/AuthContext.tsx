import { createContext, useContext, type ReactNode } from 'react';
import type { CurrentUserResponse, SessionResponse } from '../lib/auth-api';
import { BROWSER_COOKIE_CREDENTIAL } from '../lib/api-core';

export interface AuthContextValue {
  session: SessionResponse;
  currentUser: CurrentUserResponse;
  logout: () => void;
  changeOwnPassword?: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ value, children }: { value: AuthContextValue; children: ReactNode }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return auth;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}

export function useAccessToken(): string {
  useAuth();
  return BROWSER_COOKIE_CREDENTIAL;
}

export function useResolvedAccessToken(accessToken?: string): string {
  useOptionalAuth();
  return accessToken ?? BROWSER_COOKIE_CREDENTIAL;
}
