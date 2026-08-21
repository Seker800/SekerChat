import { AuthGate } from './components/AuthGate';
import { WorkspaceStartupScreen } from './components/shared/WorkspaceStartupScreen';
import { AuthProvider } from './auth/AuthContext';
import { AuthenticatedApp } from './auth/AuthenticatedApp';
import { useAuthSession } from './auth/useAuthSession';
import { RequiredPasswordChange } from './components/RequiredPasswordChange';
import { PublicFileSharePage } from './components/PublicFileSharePage';

function AuthenticatedRoute() {
  const auth = useAuthSession();

  if (auth.bootstrapState === 'loading') {
    return <WorkspaceStartupScreen message="正在恢复登录状态..." />;
  }

  if (!auth.isAuthenticated || !auth.session || !auth.currentUser) {
    return (
      <main>
        {auth.bootstrapState === 'failed' ? <p>{auth.bootstrapError}</p> : null}
        <AuthGate
          passwordError={auth.passwordError}
          isPasswordSubmitting={auth.isPasswordSubmitting}
          onOidcLogin={auth.beginOidcLogin}
          onPasswordLogin={(email, password) => auth.beginPasswordLogin(email, password)}
          onPasswordRegister={(email, password, displayName) =>
            auth.beginPasswordRegister(email, password, displayName)
          }
        />
      </main>
    );
  }

  return (
    <AuthProvider
      value={{
        session: auth.session,
        currentUser: auth.currentUser,
        logout: auth.logout,
        changeOwnPassword: auth.changeOwnPassword,
      }}
    >
      {auth.currentUser.mustChangePassword ? (
        <RequiredPasswordChange
          email={auth.currentUser.email}
          onChangePassword={auth.changeOwnPassword}
          onLogout={auth.logout}
        />
      ) : (
        <AuthenticatedApp />
      )}
    </AuthProvider>
  );
}

export default function App() {
  return window.location.pathname === '/s' ? <PublicFileSharePage /> : <AuthenticatedRoute />;
}
