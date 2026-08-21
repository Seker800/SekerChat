import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DEFAULT_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT } from '@sekerchat/shared';
import { listDMCandidates, listDMs } from '../../lib/dm-api';
import { getGroup, listGroups, listInvitableUsers, type GroupResponse } from '../../lib/groups-api';
import { listGroupArtifacts } from '../../lib/messages-files-api';
import { getGroupWorkState } from '../../lib/ops-api';
import { fetchWorkspaceBootstrap } from '../../lib/workspace-api';
import { type WorkspaceMode } from '../../store/workspace-store';
import {
  DM_ATTENDANCE_PAGE_ID,
  DM_ALBUM_PAGE_ID,
  DM_SUBSCRIPTION_PAGE_ID,
  isDmSpecialPageId,
} from '../../store/dm-special-pages';

interface UseWorkspaceQueriesOptions {
  accessToken: string;
  canInviteMembers: boolean;
  shouldLoadInvitableUsers: boolean;
  isStartDMDialogOpen: boolean;
  isSuperAdmin?: boolean;
  mode: WorkspaceMode;
  routeDmId?: string;
  routeGroupId?: string;
}

function resolveFallbackChannelId(channels: GroupResponse[], mode: WorkspaceMode): string {
  if (mode === 'server') {
    return channels.find((group) => !group.archivedAt)?.id ?? channels[0]?.id ?? '';
  }

  return channels[0]?.id ?? '';
}

export function useWorkspaceQueries({
  accessToken,
  canInviteMembers,
  shouldLoadInvitableUsers,
  isStartDMDialogOpen,
  isSuperAdmin = false,
  mode,
  routeDmId,
  routeGroupId,
}: UseWorkspaceQueriesOptions) {
  const requestedRouteGroupId = ((mode === 'dm' ? routeDmId : routeGroupId) ?? '').trim();
  const isDmAttendancePage = mode === 'dm' && requestedRouteGroupId === DM_ATTENDANCE_PAGE_ID;
  const isDmAlbumPage = mode === 'dm' && requestedRouteGroupId === DM_ALBUM_PAGE_ID;
  const isDmSubscriptionPage = mode === 'dm' && requestedRouteGroupId === DM_SUBSCRIPTION_PAGE_ID;
  const isDmSpecialPage = mode === 'dm' && isDmSpecialPageId(requestedRouteGroupId);
  const workspaceBootstrapQuery = useQuery({
    queryKey: ['workspace-bootstrap', mode, isDmSpecialPage ? '' : requestedRouteGroupId],
    queryFn: () =>
      fetchWorkspaceBootstrap(accessToken, {
        mode,
        groupId: mode === 'server' ? requestedRouteGroupId || undefined : undefined,
        dmId: mode === 'dm' && !isDmSpecialPage ? requestedRouteGroupId || undefined : undefined,
        messageLimit: DEFAULT_WORKSPACE_BOOTSTRAP_MESSAGE_LIMIT,
      }),
    staleTime: 10 * 1000,
  });
  const bootstrapData = workspaceBootstrapQuery.data;
  const isBootstrapPending = workspaceBootstrapQuery.isPending;

  const serversQuery = useQuery({
    queryKey: ['groups'],
    queryFn: () => listGroups(accessToken),
    staleTime: 30 * 1000,
    enabled: !isBootstrapPending,
    initialData: bootstrapData?.groups,
    initialDataUpdatedAt: bootstrapData ? workspaceBootstrapQuery.dataUpdatedAt : undefined,
  });

  const dmsQuery = useQuery({
    queryKey: ['dms'],
    queryFn: () => listDMs(accessToken),
    staleTime: 30 * 1000,
    enabled: !isBootstrapPending,
    refetchOnMount: false,
    initialData: bootstrapData?.dms,
    initialDataUpdatedAt: bootstrapData ? workspaceBootstrapQuery.dataUpdatedAt : undefined,
  });

  const dmCandidatesQuery = useQuery({
    queryKey: ['users', 'dm-candidates'],
    queryFn: () => listDMCandidates(accessToken),
    staleTime: 60 * 1000,
    enabled: mode === 'dm' || isStartDMDialogOpen,
  });

  const servers = serversQuery.data ?? [];
  const dms = dmsQuery.data ?? [];
  const hasLoadedChannels = mode === 'dm' ? dmsQuery.isSuccess : serversQuery.isSuccess;
  const dmUnreadCount = useMemo(
    () => dms.reduce((sum, group) => sum + (group.unreadCount ?? 0), 0),
    [dms],
  );

  const channels = mode === 'dm' ? dms : servers;
  const channelsQuery = mode === 'dm' ? dmsQuery : serversQuery;
  const requestedGroupId = requestedRouteGroupId;
  const fallbackChannelId = useMemo(
    () => resolveFallbackChannelId(channels, mode),
    [channels, mode],
  );
  const selectedGroupId = useMemo(() => {
    if (isDmSpecialPage) {
      return requestedRouteGroupId;
    }

    if (!requestedGroupId) {
      return fallbackChannelId;
    }

    // SUPER_ADMIN can view any group by ID regardless of membership
    if (isSuperAdmin) return requestedGroupId;

    return channels.some((group) => group.id === requestedGroupId)
      ? requestedGroupId
      : fallbackChannelId;
  }, [channels, fallbackChannelId, isDmSpecialPage, isSuperAdmin, requestedGroupId]);
  const fallbackSelectedGroup = useMemo(
    () => channels.find((group) => group.id === selectedGroupId),
    [channels, selectedGroupId],
  );

  const selectedGroupQuery = useQuery({
    queryKey: ['group', selectedGroupId],
    queryFn: () => getGroup(accessToken, selectedGroupId),
    enabled:
      Boolean(selectedGroupId) && !isDmSpecialPage && hasLoadedChannels && !fallbackSelectedGroup,
    staleTime: 30 * 1000,
    initialData: bootstrapData?.selectedGroup ?? fallbackSelectedGroup,
    initialDataUpdatedAt: bootstrapData
      ? workspaceBootstrapQuery.dataUpdatedAt
      : fallbackSelectedGroup
        ? Date.now()
        : undefined,
    placeholderData: fallbackSelectedGroup,
  });

  const workStateQuery = useQuery({
    queryKey: ['work-state', selectedGroupId],
    queryFn: () => getGroupWorkState(accessToken, selectedGroupId),
    enabled: mode === 'server' && Boolean(selectedGroupId),
    staleTime: 30 * 1000,
  });

  const artifactsQuery = useQuery({
    queryKey: ['artifacts', selectedGroupId],
    queryFn: () => listGroupArtifacts(accessToken, selectedGroupId),
    enabled: Boolean(selectedGroupId) && !isDmSpecialPage,
    staleTime: 30 * 1000,
  });

  const allUsersQuery = useQuery({
    queryKey: ['users', 'invitable', selectedGroupId],
    queryFn: () => listInvitableUsers(accessToken, selectedGroupId),
    staleTime: 60 * 1000,
    enabled:
      mode === 'server' && Boolean(selectedGroupId) && canInviteMembers && shouldLoadInvitableUsers,
  });

  // Prefer fallbackSelectedGroup (refreshed by ['groups'] invalidation on presence.changed)
  // over selectedGroupQuery.data (stale when the query is disabled due to fallback existing).
  const selectedGroup = isDmSpecialPage ? null : (fallbackSelectedGroup ?? selectedGroupQuery.data);
  const invitableUsers = useMemo(() => {
    if (mode !== 'server') {
      return [];
    }

    return allUsersQuery.data ?? [];
  }, [allUsersQuery.data, mode]);

  return {
    allUsersQuery,
    artifactsQuery,
    channels,
    channelsQuery,
    dmCandidatesQuery,
    dms,
    dmsQuery,
    dmUnreadCount,
    invitableUsers,
    requestedGroupId,
    selectedGroup,
    selectedGroupId,
    selectedGroupQuery,
    servers,
    serversQuery,
    workStateQuery,
    workspaceBootstrapQuery,
    isDmAttendancePage,
    isDmAlbumPage,
    isDmSubscriptionPage,
    isDmSpecialPage,
  };
}
