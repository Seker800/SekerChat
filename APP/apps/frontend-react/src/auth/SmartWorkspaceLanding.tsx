import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { WorkspaceStartupScreen } from '../components/shared/WorkspaceStartupScreen';
import { BROWSER_COOKIE_CREDENTIAL } from '../lib/api-core';
import { getAlbumUpdateStatus } from '../lib/album-api';
import {
  DM_ALBUM_ROUTE,
  DM_ATTENDANCE_ROUTE,
} from '../store/workspace-store';

export function SmartWorkspaceLanding() {
  const albumUpdateStatusQuery = useQuery({
    queryKey: ['album', 'update-status'],
    queryFn: () => getAlbumUpdateStatus(BROWSER_COOKIE_CREDENTIAL),
    staleTime: 15_000,
  });

  if (albumUpdateStatusQuery.isPending) {
    return <WorkspaceStartupScreen message="正在确定首页..." />;
  }

  if (albumUpdateStatusQuery.data?.hasUpdates) {
    return <Navigate to={DM_ALBUM_ROUTE} replace />;
  }

  return <Navigate to={DM_ATTENDANCE_ROUTE} replace />;
}
