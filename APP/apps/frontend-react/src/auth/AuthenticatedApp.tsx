import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { WorkspaceStartupScreen } from '../components/shared/WorkspaceStartupScreen';
import { SmartWorkspaceLanding } from './SmartWorkspaceLanding';

const AdminPage = lazy(async () => ({
  default: (await import('../components/admin/AdminPage')).AdminPage,
}));

const WorkspaceShell = lazy(async () => ({
  default: (await import('../components/workspace/WorkspaceShell')).WorkspaceShell,
}));

export function AuthenticatedApp() {
  return (
    <Suspense fallback={<WorkspaceStartupScreen message="正在加载工作区..." />}>
      <Routes>
        <Route path="/" element={<SmartWorkspaceLanding />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/groups" element={<WorkspaceShell />} />
        <Route path="/groups/:groupId" element={<WorkspaceShell />} />
        <Route path="/dm" element={<SmartWorkspaceLanding />} />
        <Route path="/dm/:dmId" element={<WorkspaceShell mode="dm" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
