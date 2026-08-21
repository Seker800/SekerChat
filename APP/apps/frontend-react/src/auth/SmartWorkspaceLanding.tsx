import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { WorkspaceStartupScreen } from '../components/shared/WorkspaceStartupScreen';
import { BROWSER_COOKIE_CREDENTIAL } from '../lib/api-core';
import { getAlbumUpdateStatus } from '../lib/album-api';
import { getSubscriptionSummary } from '../lib/subscriptions-api';
import {
  DM_ALBUM_ROUTE,
  DM_ATTENDANCE_ROUTE,
  DM_SUBSCRIPTION_ROUTE,
} from '../store/workspace-store';

export function SmartWorkspaceLanding() {
  const subscriptionSummaryQuery = useQuery({
    queryKey: ['subscription-summary'],
    queryFn: () => getSubscriptionSummary(BROWSER_COOKIE_CREDENTIAL),
    staleTime: 15_000,
  });
  const albumUpdateStatusQuery = useQuery({
    queryKey: ['album', 'update-status'],
    queryFn: () => getAlbumUpdateStatus(BROWSER_COOKIE_CREDENTIAL),
    staleTime: 15_000,
  });

  if (subscriptionSummaryQuery.isPending || albumUpdateStatusQuery.isPending) {
    return <WorkspaceStartupScreen message="正在确定首页..." />;
  }

  if ((subscriptionSummaryQuery.data?.pendingConfirmationCount ?? 0) > 0) {
    return <Navigate to={DM_SUBSCRIPTION_ROUTE} replace />;
  }

  if (albumUpdateStatusQuery.data?.hasUpdates) {
    return <Navigate to={DM_ALBUM_ROUTE} replace />;
  }

  return <Navigate to={DM_ATTENDANCE_ROUTE} replace />;
}
