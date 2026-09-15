import { AuthGate } from './components/AuthGate';
import { WorkspaceStartupScreen } from './components/shared/WorkspaceStartupScreen';
import { AuthProvider } from './auth/AuthContext';
import { AuthenticatedApp } from './auth/AuthenticatedApp';
import { useAuthSession } from './auth/useAuthSession';
import { RequiredPasswordChange } from './components/RequiredPasswordChange';
import { PublicFileSharePage } from './components/PublicFileSharePage';
import { LanguageProvider } from './i18n/LanguageProvider';
import { useLocation } from 'react-router-dom';

function AuthenticatedRoute() {
  const auth = useAuthSession();

  if (auth.bootstrapState === 'loading') {
    return <WorkspaceStartupScreen message="正在恢复登录状态..." />;
  }

  if (!auth.isAuthenticated || !auth.session || !auth.currentUser) {
    return (
      <AuthGate
        passwordError={auth.passwordError}
        isPasswordSubmitting={auth.isPasswordSubmitting}
        onPasswordLogin={(email, password) => auth.beginPasswordLogin(email, password)}
        onPasswordRegister={(email, password, displayName) =>
          auth.beginPasswordRegister(email, password, displayName)
        }
      />
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
  const location = useLocation();
  return (
    <LanguageProvider pathname={location.pathname}>
      {location.pathname === '/s' ? <PublicFileSharePage /> : <AuthenticatedRoute />}
    </LanguageProvider>
  );
}
