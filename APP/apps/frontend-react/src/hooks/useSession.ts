import { useEffect, useMemo, useRef, useState } from 'react';
import {
  changePassword,
  createOidcLoginUrl,
  getCurrentUser,
  login,
  logout,
  refreshSession,
  register,
  type CurrentUserResponse,
  type SessionResponse,
} from '../lib/auth-api';
import { registerAuthSessionController } from '../lib/api-core';
import { clearPrivateMediaCache } from '../components/workspace/media/privateMediaRepository';

const oidcErrorMessages: Record<string, string> = {
  oidc_access_denied: '群晖登录被取消或被拒绝。',
  oidc_bad_request: 'OIDC 配置不完整或回调参数无效。',
  oidc_callback_failed: 'OIDC 登录回调失败。',
  oidc_forbidden: '当前群晖账号无法完成本地账户映射。',
  oidc_server_error: '群晖 SSO Server 返回了服务端错误。',
  oidc_unauthorized: 'OIDC 身份校验失败，请重新发起登录。',
};

function isExpectedMissingSessionError(error: unknown): boolean {
  return error instanceof Error
    && (error.message.includes('登录状态已失效') || error.message.includes('Missing refresh token'));
}

export function useSession() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [bootstrapState, setBootstrapState] = useState<'idle' | 'loading' | 'failed'>('loading');
  const [bootstrapError, setBootstrapError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isPasswordSubmitting, setIsPasswordSubmitting] = useState(false);
  const establishSessionRef = useRef<(
    nextSession: SessionResponse,
    knownCurrentUser?: CurrentUserResponse,
  ) => Promise<void>>(async () => {});
  const clearSessionStateRef = useRef<() => void>(() => {});

  useEffect(() => {
    let active = true;

    function clearSessionState() {
      clearPrivateMediaCache();
      setSession(null);
      setCurrentUser(null);
      // Remove credentials written by versions before the cookie-only migration.
      try {
        sessionStorage.removeItem('sekerchat_refresh');
      } catch {
        // Storage may be unavailable in hardened/private browser contexts.
      }
    }

    async function establishSession(
      nextSession: SessionResponse,
      knownCurrentUser?: CurrentUserResponse,
    ) {
      const me = knownCurrentUser ?? await getCurrentUser();
      if (!active) return;
      const normalizedSession = { user: { ...me, ...nextSession.user } };
      setSession(normalizedSession);
      setCurrentUser({ ...me, ...nextSession.user });
    }

    async function refreshAuthenticatedSession(): Promise<boolean> {
      try {
        await establishSession(await refreshSession());
        if (active) {
          setBootstrapState('idle');
          setBootstrapError('');
        }
        return true;
      } catch (error) {
        if (active) {
          clearSessionState();
          setBootstrapState('failed');
          setBootstrapError(error instanceof Error ? error.message : '登录状态刷新失败。');
        }
        return false;
      }
    }

    async function bootstrap() {
      setBootstrapState('loading');
      try {
        try {
          sessionStorage.removeItem('sekerchat_refresh');
        } catch {
          // See clearSessionState.
        }

        const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
        const params = new URLSearchParams(hash);
        const authError = params.get('authError');
        if (hash) window.history.replaceState({}, '', window.location.pathname + window.location.search);
        if (authError) {
          throw new Error(oidcErrorMessages[authError] ?? `登录失败：${decodeURIComponent(authError)}`);
        }

        try {
          const me = await getCurrentUser();
          await establishSession({ user: me }, me);
          if (active) setBootstrapState('idle');
          return;
        } catch (error) {
          if (!isExpectedMissingSessionError(error)) throw error;
        }

        try {
          await refreshSession();
          const me = await getCurrentUser();
          await establishSession({ user: me }, me);
          if (active) setBootstrapState('idle');
        } catch (error) {
          if (!isExpectedMissingSessionError(error)) throw error;
          if (active) setBootstrapState('idle');
        }
      } catch (error) {
        if (!active) return;
        clearSessionState();
        setBootstrapState('failed');
        setBootstrapError(error instanceof Error ? error.message : 'OIDC 登录回调处理失败。');
      }
    }

    establishSessionRef.current = establishSession;
    clearSessionStateRef.current = clearSessionState;
    registerAuthSessionController({ refreshSession: refreshAuthenticatedSession });
    void bootstrap();
    return () => {
      active = false;
      registerAuthSessionController(null);
    };
  }, []);

  return useMemo(
    () => ({
      session,
      currentUser,
      bootstrapState,
      bootstrapError,
      isAuthenticated: Boolean(session && currentUser),
      passwordError,
      isPasswordSubmitting,
      beginOidcLogin() {
        window.location.assign(createOidcLoginUrl());
      },
      async beginPasswordLogin(email: string, password: string) {
        setIsPasswordSubmitting(true);
        setPasswordError('');
        try {
          await establishSessionRef.current(await login(email, password));
          setBootstrapState('idle');
          setBootstrapError('');
        } catch (error) {
          setPasswordError(error instanceof Error ? error.message : '登录失败');
        } finally {
          setIsPasswordSubmitting(false);
        }
      },
      async beginPasswordRegister(email: string, password: string, displayName?: string) {
        setIsPasswordSubmitting(true);
        setPasswordError('');
        try {
          await establishSessionRef.current(await register(email, password, displayName));
          setBootstrapState('idle');
          setBootstrapError('');
        } catch (error) {
          setPasswordError(error instanceof Error ? error.message : '注册失败');
        } finally {
          setIsPasswordSubmitting(false);
        }
      },
      async changeOwnPassword(currentPassword: string, newPassword: string) {
        if (!session || !currentUser) throw new Error('登录状态已失效，请重新登录。');
        const nextSession = await changePassword(currentPassword, newPassword);
        await establishSessionRef.current(nextSession, {
          ...currentUser,
          ...nextSession.user,
          mustChangePassword: false,
        });
      },
      logout() {
        void logout();
        clearSessionStateRef.current();
      },
    }),
    [bootstrapError, bootstrapState, currentUser, isPasswordSubmitting, passwordError, session],
  );
}
