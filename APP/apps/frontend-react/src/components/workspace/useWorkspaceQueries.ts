import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listDMCandidates, listDMs } from '../../lib/dm-api';
import { getGroup, listGroups, listInvitableUsers, type GroupResponse } from '../../lib/groups-api';
import { listGroupArtifacts } from '../../lib/messages-files-api';
import { getGroupWorkState } from '../../lib/ops-api';
import { fetchWorkspaceBootstrap } from '../../lib/workspace-api';
import { type WorkspaceMode } from '../../store/workspace-store';
import {
  DM_ATTENDANCE_PAGE_ID,
  DM_MONTHLY_REPORT_PAGE_ID,
  DM_ALBUM_PAGE_ID,
  DM_SUBSCRIPTION_PAGE_ID,
  isDmSpecialPageId,
} from '../../store/dm-special-pages';

interface UseWorkspaceQueriesOptions {
  accessToken: string;
  canInviteMembers: boolean;
  canAccessAnyGroup?: boolean;
  currentUserId?: string;
  shouldLoadInvitableUsers: boolean;
  isStartDMDialogOpen: boolean;
  mode: WorkspaceMode;
  routeDmId?: string;
  routeGroupId?: string;
}

function resolveFallbackGroupId(groups: GroupResponse[], mode: WorkspaceMode): string {
  if (mode === 'server') {
    return groups.find((group) => !group.archivedAt)?.id ?? groups[0]?.id ?? '';
  }

  return groups[0]?.id ?? '';
}

export function useWorkspaceQueries({
  accessToken,
  canInviteMembers,
  canAccessAnyGroup = false,
  currentUserId = '',
  shouldLoadInvitableUsers,
  isStartDMDialogOpen,
  mode,
  routeDmId,
  routeGroupId,
}: UseWorkspaceQueriesOptions) {
  const requestedRouteGroupId = ((mode === 'dm' ? routeDmId : routeGroupId) ?? '').trim();
  const isDmAttendancePage = mode === 'dm' && requestedRouteGroupId === DM_ATTENDANCE_PAGE_ID;
  const isDmMonthlyReportPage =
    mode === 'dm' && requestedRouteGroupId === DM_MONTHLY_REPORT_PAGE_ID;
  const isDmAlbumPage = mode === 'dm' && requestedRouteGroupId === DM_ALBUM_PAGE_ID;
  const isDmSubscriptionPage = mode === 'dm' && requestedRouteGroupId === DM_SUBSCRIPTION_PAGE_ID;
  const isDmSpecialPage = mode === 'dm' && isDmSpecialPageId(requestedRouteGroupId);
  // The snapshot owns channel lists and config; the timeline owns messages.
  // Keying this by route groupId made every channel switch re-download the entire
  // workspace (and its messages) only to discard most of the response.
  const workspaceBootstrapQuery = useQuery({
    queryKey: ['workspace-snapshot', mode, currentUserId],
    queryFn: () =>
      fetchWorkspaceBootstrap(accessToken, {
        mode,
        includeMessages: false,
      }),
    staleTime: 60 * 1000,
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

  const groups = mode === 'dm' ? dms : servers;
  const groupsQuery = mode === 'dm' ? dmsQuery : serversQuery;
  const requestedGroupId = requestedRouteGroupId;
  const fallbackGroupId = useMemo(() => resolveFallbackGroupId(groups, mode), [groups, mode]);
  const selectedGroupId = useMemo(() => {
    if (isDmSpecialPage) {
      return requestedRouteGroupId;
    }

    if (!requestedGroupId) {
      return fallbackGroupId;
    }

    // Full-access admins can view any group by ID regardless of membership.
    if (mode === 'server' && canAccessAnyGroup) return requestedGroupId;

    return groups.some((group) => group.id === requestedGroupId)
      ? requestedGroupId
      : fallbackGroupId;
  }, [canAccessAnyGroup, groups, fallbackGroupId, isDmSpecialPage, mode, requestedGroupId]);
  const fallbackSelectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId),
    [groups, selectedGroupId],
  );
  const isSelectedGroupMember = useMemo(
    () =>
      groups.some(
        (group) =>
          group.id === selectedGroupId &&
          group.members.some((member) => member.userId === currentUserId),
      ),
    [currentUserId, groups, selectedGroupId],
  );

  const bootstrapSelectedGroup = bootstrapData?.selectedGroup;
  const bootstrapGroupMatches = bootstrapSelectedGroup?.id === selectedGroupId;
  const selectedGroupQuery = useQuery({
    queryKey: ['group', selectedGroupId],
    queryFn: () => getGroup(accessToken, selectedGroupId),
    enabled:
      Boolean(selectedGroupId) && !isDmSpecialPage && hasLoadedChannels && !fallbackSelectedGroup,
    staleTime: 30 * 1000,
    initialData: bootstrapGroupMatches ? bootstrapSelectedGroup : fallbackSelectedGroup,
    initialDataUpdatedAt: bootstrapGroupMatches
      ? workspaceBootstrapQuery.dataUpdatedAt
      : fallbackSelectedGroup
        ? Date.now()
        : undefined,
    placeholderData: fallbackSelectedGroup,
  });

  const workStateQuery = useQuery({
    queryKey: ['work-state', selectedGroupId],
    queryFn: () => getGroupWorkState(accessToken, selectedGroupId),
    enabled: mode === 'server' && Boolean(selectedGroupId) && isSelectedGroupMember,
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
      mode === 'server' &&
      Boolean(selectedGroupId) &&
      canInviteMembers &&
      shouldLoadInvitableUsers &&
      isSelectedGroupMember,
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
    groups,
    groupsQuery,
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
    isDmMonthlyReportPage,
    isDmAlbumPage,
    isDmSubscriptionPage,
    isDmSpecialPage,
  };
}
