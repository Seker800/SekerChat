import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { CurrentUserResponse } from '../../lib/auth-api';
import {
  adminJoinGroup,
  leaveGroup,
  listAdminDiscoverableGroups,
  listServers,
  type GroupResponse,
} from '../../lib/groups-api';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  DM_ATTENDANCE_ROUTE,
  useWorkspaceStore,
  type WorkspaceMode,
} from '../../store/workspace-store';
import {
  DM_ATTENDANCE_PAGE_ID,
  DM_SUBSCRIPTION_PAGE_ID,
  getDmSpecialPage,
} from '../../store/dm-special-pages';
import { useArtifacts } from './useArtifacts';
import { useComposer } from './useComposer';
import { useDmActions } from './useDmActions';
import { useManagePanel } from './useManagePanel';
import { useMessageList } from './useMessageList';
import {
  buildServerStats,
  DEFAULT_CATEGORY,
  resolveServerLandingGroup,
  useServerTree,
  type ServerRailItem,
} from './useServerTree';
import { useWorkspaceDialogs } from './useWorkspaceDialogs';
import { useWorkspaceMutations } from './useWorkspaceMutations';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import { useWorkspaceQueries } from './useWorkspaceQueries';
import {
  getDefaultRolePermissions,
  hasSystemPermission,
  type RolePermissions,
} from '@sekerchat/shared';

interface WorkspaceShellModelProps {
  accessToken: string;
  currentUser: CurrentUserResponse;
  mode?: WorkspaceMode;
  rolePermissions?: RolePermissions | null;
  chatAttachmentMaxMB?: number;
}

export function useWorkspaceShellModel({
  accessToken,
  currentUser,
  mode = 'server',
  rolePermissions,
  chatAttachmentMaxMB,
}: WorkspaceShellModelProps) {
  const navigate = useNavigate();
  const params = useParams<{ groupId: string; dmId: string }>();
  const queryClient = useQueryClient();
  const isNarrowViewport = useMediaQuery('(max-width: 880px)');
  const isSecondarySurfaceViewport = useMediaQuery('(max-width: 1200px)');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isAuxSidebarOpen, setIsAuxSidebarOpen] = useState(false);
  const [hasRequestedInvitableUsers, setHasRequestedInvitableUsers] = useState(false);
  const setReplyToMessageId = useWorkspaceStore((state) => state.setReplyToMessageId);
  const setWorkspaceMode = useWorkspaceStore((state) => state.setWorkspaceMode);
  const unhideDmFromStore = useWorkspaceStore((state) => state.unhideDm);
  const dialogs = useWorkspaceDialogs({
    currentUser,
  });
  const resolvedRolePermissions = rolePermissions ?? null;
  const effectiveRolePermissions = resolvedRolePermissions ?? getDefaultRolePermissions();
  const hasFullAccess = hasSystemPermission(
    effectiveRolePermissions,
    currentUser.role,
    'view_all_groups',
  );
  const canJoinAnyGroup = hasSystemPermission(
    effectiveRolePermissions,
    currentUser.role,
    'join_any_group',
  );
  const isSuperAdmin = currentUser.role === 'SUPER_ADMIN';
  const canInviteMembers = useMemo(
    () =>
      mode === 'server' &&
      Boolean(resolvedRolePermissions) &&
      hasSystemPermission(resolvedRolePermissions, currentUser.role, 'invite_members'),
    [currentUser.role, mode, resolvedRolePermissions],
  );

  const workspaceQueries = useWorkspaceQueries({
    accessToken,
    canInviteMembers,
    canAccessAnyGroup: hasFullAccess,
    currentUserId: currentUser.id,
    shouldLoadInvitableUsers: hasRequestedInvitableUsers,
    isStartDMDialogOpen: dialogs.isStartDMDialogOpen,
    mode,
    routeDmId: params.dmId,
    routeGroupId: params.groupId,
  });

  const {
    allUsersQuery,
    artifactsQuery,
    groups,
    groupsQuery,
    dmCandidatesQuery,
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
  } = workspaceQueries;
  const notificationGroups = useMemo(
    () => [...servers, ...workspaceQueries.dms],
    [servers, workspaceQueries.dms],
  );

  const loadError = serversQuery.isError
    ? {
        source: 'servers' as const,
        message:
          serversQuery.error instanceof Error ? serversQuery.error.message : '无法加载群组数据',
      }
    : mode === 'dm' && dmsQuery.isError
      ? {
          source: 'dms' as const,
          message: dmsQuery.error instanceof Error ? dmsQuery.error.message : '无法加载私聊数据',
        }
      : null;

  const serverDirectoryQuery = useQuery({
    queryKey: ['server-directory'],
    queryFn: () => listServers(accessToken),
    enabled: hasFullAccess && mode === 'server',
    staleTime: 30 * 1000,
  });

  const serverTree = useServerTree({
    groups,
    selectedGroup: selectedGroup ?? undefined,
    servers,
    serverDirectory: serverDirectoryQuery.data ?? [],
    canAccessAllChannels: hasFullAccess,
  });

  const {
    activeGroups,
    archivedServerGroups,
    archivedServerRailItems,
    serverGroups,
    serverNames,
    serverRailItems,
    unjoinedServerRailItems,
    selectedServerName,
    selectedServerId,
    serverOptions,
  } = serverTree;

  const discoverableQuery = useQuery({
    queryKey: ['admin-discovery', 'former', selectedServerId],
    queryFn: () =>
      listAdminDiscoverableGroups(accessToken, { scope: 'former', serverId: selectedServerId }),
    enabled: hasFullAccess && mode === 'server' && Boolean(selectedServerId),
    staleTime: 0,
  });

  const joinGroupMutation = useMutation({
    mutationFn: (groupId: string) => adminJoinGroup(accessToken, groupId),
    onSuccess: async () => {
      dialogs.pushNotice('success', '已加入频道。');
      await discoverableQuery.refetch();
      await groupsQuery.refetch();
      await serverDirectoryQuery.refetch();
    },
    onError: (error) => {
      dialogs.pushNotice('error', error instanceof Error ? error.message : '加入频道失败。');
    },
  });

  const navigation = useWorkspaceNavigation({
    isNarrowViewport,
    isSecondarySurfaceViewport,
    mode,
    navigate,
    setIsAuxSidebarOpen,
    setIsMobileSidebarOpen,
    setReplyToMessageId,
    setWorkspaceMode,
  });
  const dmSpecialPage = getDmSpecialPage(selectedGroupId);
  const isSelectedGroupMember = Boolean(
    selectedGroup && selectedGroup.members.some((member) => member.userId === currentUser.id),
  );

  const openServer = useCallback(
    async (serverId: string) => {
      const openGroup = (groupId: string) => {
        if (mode === 'dm') {
          setWorkspaceMode('server');
          setReplyToMessageId('');
          void navigate(`/groups/${groupId}`);
          return;
        }
        navigation.navigateToGroup(groupId, { keepMobileSidebarOpen: true });
      };

      const fallbackGroup = resolveServerLandingGroup(servers, serverId);
      if (fallbackGroup) {
        openGroup(fallbackGroup.id);
        return;
      }

      if (!hasFullAccess) {
        return;
      }

      try {
        const discoverableGroups = await queryClient.fetchQuery({
          queryKey: ['admin-discovery', 'former', serverId],
          queryFn: () => listAdminDiscoverableGroups(accessToken, { scope: 'former', serverId }),
          staleTime: 0,
        });
        const landingGroup =
          discoverableGroups.find((group) => !group.archivedAt) ?? discoverableGroups[0];
        if (!landingGroup) {
          dialogs.pushNotice('info', '该 Server 下暂无频道。');
          return;
        }
        openGroup(landingGroup.id);
      } catch (error) {
        dialogs.pushNotice('error', error instanceof Error ? error.message : '无法打开 Server。');
      }
    },
    [
      accessToken,
      dialogs,
      hasFullAccess,
      mode,
      navigate,
      navigation,
      queryClient,
      servers,
      setReplyToMessageId,
      setWorkspaceMode,
    ],
  );

  const canManageGroup = mode === 'server';
  const {
    messagesQuery,
    messages,
    olderMessagesCursor,
    isLoadingOlderMessages,
    loadOlderMessages,
    patchLoadedMessage,
    handleVisibleLatestMessage,
  } = useMessageList({
    accessToken,
    selectedGroupId: isDmSpecialPage ? '' : selectedGroupId,
    initialMessages: workspaceBootstrapQuery.data?.messages ?? null,
    initialMessagesUpdatedAt: workspaceBootstrapQuery.dataUpdatedAt,
    canAdvanceReadCursor: isSelectedGroupMember,
    onError: (message) => dialogs.pushNotice('error', message),
  });

  const {
    composer,
    replyToMessageId,
    pendingUploads,
    clearPendingError,
    retryFailedMessage,
    retryPendingUpload,
  } = useComposer({
    accessToken,
    chatAttachmentMaxMB,
    selectedGroupId: isDmSpecialPage ? '' : selectedGroupId,
    messages,
    channelName: dmSpecialPage?.label ?? selectedGroup?.name ?? '',
    currentUser,
    onError: (message) => dialogs.pushNotice('error', message),
    refetchMessages: () => void messagesQuery.refetch(),
    groupMembers: isDmSpecialPage ? [] : (selectedGroup?.members ?? []),
  });

  const { manage } = useManagePanel({
    accessToken,
    selectedGroupId,
    selectedGroup: selectedGroup ?? undefined,
    canManageGroup,
    workStateData: workStateQuery.data ?? null,
    onError: (message) => dialogs.pushNotice('error', message),
    onSuccess: (message) => dialogs.pushNotice('success', message),
    serverOptions,
  });

  const dmActions = useDmActions({
    accessToken,
    navigate,
    pushNotice: dialogs.pushNotice,
    queryClient,
    setIsStartDMDialogOpen: dialogs.setIsStartDMDialogOpen,
    setWorkspaceMode,
    unhideDmFromStore,
  });

  const refetchArtifactsQuery = artifactsQuery.refetch;
  const refetchSelectedGroupQuery = selectedGroupQuery.refetch;
  const refetchArtifacts = useCallback(async () => {
    await refetchArtifactsQuery();
  }, [refetchArtifactsQuery]);
  const refetchSelectedGroup = useCallback(async () => {
    await refetchSelectedGroupQuery();
  }, [refetchSelectedGroupQuery]);
  const handleArtifactError = useCallback(
    (message: string) => dialogs.pushNotice('error', message),
    [dialogs.pushNotice],
  );
  const handleArtifactSuccess = useCallback(
    (message: string) => dialogs.pushNotice('success', message),
    [dialogs.pushNotice],
  );

  const { artifacts } = useArtifacts({
    accessToken,
    selectedGroupId,
    selectedGroup: selectedGroup ?? undefined,
    items: artifactsQuery.data ?? [],
    onError: handleArtifactError,
    onSuccess: handleArtifactSuccess,
    refetchArtifacts,
    refetchGroup: refetchSelectedGroup,
  });

  const mutations = useWorkspaceMutations({
    accessToken,
    groupsQuery,
    createChannelInServerName: dialogs.createChannelInServerName,
    createChannelName: dialogs.createChannelName,
    createServerName: dialogs.createServerName,
    mode,
    navigateToGroup: navigation.navigateToGroup,
    patchLoadedMessage,
    pushNotice: dialogs.pushNotice,
    renameServerName: dialogs.renameServerName,
    selectedServerId,
    selectedGroupId,
    selectedGroupQuery,
    serverDialogState: dialogs.serverDialogState,
    serversQuery,
    setCreateChannelInServerName: dialogs.setCreateChannelInServerName,
    setCreateChannelName: dialogs.setCreateChannelName,
    setCreateServerName: dialogs.setCreateServerName,
    setIsCreateChannelDialogOpen: dialogs.setIsCreateChannelDialogOpen,
    setServerDialogState: dialogs.setServerDialogState,
    workStateQuery,
  });

  const activeMember = useMemo(
    () =>
      selectedGroup?.members.find((member) => member.userId === dialogs.memberDialogUserId) ?? null,
    [dialogs.memberDialogUserId, selectedGroup],
  );

  const openChannelSettingsForGroup = useCallback(
    (groupId: string) => {
      if (groupId !== selectedGroupId) {
        navigation.navigateToGroup(groupId, {});
      }

      dialogs.setIsChannelDialogOpen(true);
    },
    [dialogs, navigation, selectedGroupId],
  );

  const requestArchiveGroup = useCallback(
    (groupId: string) => {
      if (mode !== 'server') {
        dialogs.pushNotice('info', '私聊不支持归档操作。');
        return;
      }

      const group = groups.find((item) => item.id === groupId);
      if (!group) {
        return;
      }

      if (groupId !== selectedGroupId) {
        navigation.navigateToGroup(groupId, {});
      }

      dialogs.setConfirmDialog({
        title: group.archivedAt ? '取消归档频道' : '归档频道',
        description: group.archivedAt
          ? `确认恢复频道「${group.name}」为可协作状态？`
          : `确认将频道「${group.name}」归档为只读？`,
        confirmLabel: group.archivedAt ? '取消归档' : '确认归档',
        isDanger: !group.archivedAt,
        onConfirm: () => {
          dialogs.setConfirmDialog(null);
          void mutations.archiveGroupMutation.mutateAsync({ groupId, archive: !group.archivedAt });
        },
      });
    },
    [groups, dialogs, mode, mutations.archiveGroupMutation, navigation, selectedGroupId],
  );

  const requestArchiveServer = useCallback(
    (serverId: string) => {
      const server = [...serverRailItems, ...archivedServerRailItems].find(
        (item) => item.id === serverId,
      );
      if (!server) return;
      const isArchived = server.isArchived;

      dialogs.setConfirmDialog({
        title: isArchived ? '取消归档 Server' : '归档 Server',
        description: isArchived
          ? `确认恢复 Server「${server.name}」？工作状态配置为自动归档的频道将继续保留在归档列表中，其余频道恢复为可协作状态。`
          : `确认归档 Server「${server.name}」？其下所有频道将被设为只读。`,
        confirmLabel: isArchived ? '取消归档' : '确认归档',
        isDanger: !isArchived,
        onConfirm: () => {
          dialogs.setConfirmDialog(null);
          void mutations.archiveServerMutation.mutateAsync({ serverId, archive: !isArchived });
        },
      });
    },
    [archivedServerRailItems, serverRailItems, dialogs, mutations.archiveServerMutation],
  );

  const requestHideServer = useCallback(
    (server: ServerRailItem) => {
      if (server.name === DEFAULT_CATEGORY || server.id.startsWith('legacy:')) return;
      dialogs.setConfirmDialog({
        title: '隐藏 Server',
        description: `确认隐藏 Server「${server.name}」？隐藏后它将从所有列表、搜索和发现中消失，但数据不会删除。需要恢复时请使用维护脚本。`,
        confirmLabel: '隐藏',
        isDanger: true,
        onConfirm: async () => {
          dialogs.setConfirmDialog(null);
          try {
            await mutations.hideServerMutation.mutateAsync({
              serverId: server.id,
              hidden: true,
            });
            if (selectedServerId === server.id) {
              const nextGroup = groups.find(
                (group) => group.serverId !== server.id && !group.archivedAt,
              );
              if (nextGroup) {
                navigation.navigateToGroup(nextGroup.id);
              } else {
                setWorkspaceMode('dm');
                void navigate(DM_ATTENDANCE_ROUTE);
              }
            }
          } catch {
            // The mutation's onError handler already surfaces the failure notice.
          }
        },
      });
    },
    [
      dialogs,
      groups,
      mutations.hideServerMutation,
      navigate,
      navigation,
      selectedServerId,
      setWorkspaceMode,
    ],
  );

  const requestLeaveGroup = useCallback(() => {
    if (!selectedGroupId) return;
    dialogs.setConfirmDialog({
      title: '退出频道',
      description: `确认退出当前频道？退出后可从 Server 设置页面的「可加入的频道」重新加入。`,
      confirmLabel: '确认退出',
      isDanger: true,
      onConfirm: async () => {
        dialogs.setConfirmDialog(null);
        try {
          await leaveGroup(accessToken, selectedGroupId);
          dialogs.pushNotice('success', '已退出频道。');
          await discoverableQuery.refetch();
          await groupsQuery.refetch();
          if (mode === 'dm') await serversQuery.refetch();
          await serverDirectoryQuery.refetch();
          // Navigate to next group in same server, fallback to any other
          const sameServer = groups.find(
            (group) => group.id !== selectedGroupId && group.serverId === selectedServerId,
          );
          const next = sameServer ?? groups.find((g) => g.id !== selectedGroupId);
          if (next) navigation.navigateToGroup(next.id);
        } catch (error) {
          dialogs.pushNotice('error', error instanceof Error ? error.message : '退出频道失败。');
        }
      },
    });
  }, [
    accessToken,
    groups,
    groupsQuery,
    dialogs,
    discoverableQuery,
    navigation,
    selectedGroupId,
    selectedServerId,
    serverDirectoryQuery,
    serversQuery,
  ]);

  const requestRemoveMember = useCallback(
    (memberUserId: string) => {
      const target = selectedGroup?.members.find((member) => member.userId === memberUserId);
      if (!target) {
        return;
      }

      dialogs.setConfirmDialog({
        title: '移出频道',
        description: `确认将 ${target.displayName || target.email} 移出当前频道？`,
        confirmLabel: '确认移出',
        isDanger: true,
        onConfirm: () => {
          manage.onRemoveMember(memberUserId);
          dialogs.closeMemberDialog();
          dialogs.setConfirmDialog(null);
          dialogs.pushNotice('info', '成员移出请求已提交。');
        },
      });
    },
    [dialogs, manage, selectedGroup],
  );

  const memberDialog = useMemo(
    () => ({
      canRemove: Boolean(activeMember) && activeMember?.userId !== currentUser.id,
      canDM: Boolean(activeMember) && activeMember?.userId !== currentUser.id,
      isOpen: Boolean(activeMember),
      member: activeMember,
      onClose: dialogs.closeMemberDialog,
      onMention: () => {
        if (!activeMember) {
          return;
        }

        composer.onSeedMention(`@${activeMember.displayName || activeMember.email}`);
        dialogs.closeMemberDialog();
        dialogs.pushNotice('info', '已把 @ 提及写入输入框。');
      },
      onRemove: () => {
        if (!activeMember) {
          return;
        }

        requestRemoveMember(activeMember.userId);
      },
      onStartDM: () => {
        if (!activeMember) return;
        dialogs.closeMemberDialog();
        void dmActions.startDMWithUser(activeMember.userId);
      },
    }),
    [activeMember, composer, currentUser.id, dialogs, dmActions, requestRemoveMember],
  );

  const mentionMember = useCallback(
    (memberUserId: string) => {
      const member = selectedGroup?.members.find((item) => item.userId === memberUserId);
      if (!member) {
        return;
      }

      composer.onSeedMention(`@${member.displayName || member.email}`);
      dialogs.pushNotice('info', '已把 @ 提及写入输入框。');
    },
    [composer, dialogs, selectedGroup],
  );

  const refreshInvitableUsers = useCallback(() => {
    setHasRequestedInvitableUsers(true);
    void allUsersQuery.refetch();
  }, [allUsersQuery]);

  const requestInvitableUsers = useCallback(() => {
    if (hasRequestedInvitableUsers) {
      void allUsersQuery.refetch();
      return;
    }

    setHasRequestedInvitableUsers(true);
  }, [allUsersQuery, hasRequestedInvitableUsers]);

  return {
    activeGroups: activeGroups,
    archivedServerGroups,
    archivedServerRailItems,
    artifacts,
    serverGroups,
    serverNames,
    serverRailItems,
    unjoinedServerRailItems,
    serverOptions,
    hasFullAccess,
    canJoinAnyGroup,
    isSelectedGroupMember,
    openServer,
    channelDialog: dialogs.channelDialog,
    discoverableGroups: discoverableQuery.data ?? [],
    isJoiningGroup: joinGroupMutation.isPending,
    isSuperAdmin,
    closeAuxSidebar: navigation.closeAuxSidebar,
    closeMobileSidebar: navigation.closeMobileSidebar,
    composer,
    pendingUploads,
    clearPendingError,
    retryFailedMessage,
    retryPendingUpload,
    onVisibleLatestMessage: handleVisibleLatestMessage,
    confirmDialog: dialogs.confirmDialogModel,
    dmUnreadCount,
    servers,
    groups,
    notificationGroups,
    groupsQuery,
    isLoading:
      workspaceBootstrapQuery.isPending ||
      serversQuery.isLoading ||
      (mode === 'dm' && workspaceQueries.dmsQuery.isLoading),
    loadError,
    retryLoadError: () => {
      if (loadError?.source === 'servers') {
        void serversQuery.refetch();
        return;
      }
      if (loadError?.source === 'dms') {
        void dmsQuery.refetch();
      }
    },
    isServerGroupsLoading: workspaceBootstrapQuery.isPending || serversQuery.isPending,
    refreshGroupList: () => {
      void groupsQuery.refetch();
    },
    refreshServerList: () => {
      void serversQuery.refetch();
      void serverDirectoryQuery.refetch();
    },
    requestedGroupId,
    selectedGroupQuery,
    header: {
      channelMeta:
        mode === 'dm'
          ? (dmSpecialPage?.description ?? '收件箱')
          : `${selectedServerName} · ${selectedGroup?.memberCount ?? selectedGroup?.members.length ?? 0} 人 · ${selectedGroup?.archivedAt ? '只读' : isSelectedGroupMember ? '可协作' : '未加入'}`,
      channelName: dmSpecialPage?.label ?? selectedGroup?.name ?? '',
      userLabel: currentUser.email,
    },
    isAuxSidebarOpen,
    invitableUsers,
    isInvitableUsersLoading: allUsersQuery.isLoading,
    isInvitableUsersRefreshing: allUsersQuery.isFetching && !allUsersQuery.isLoading,
    invitableUsersError: allUsersQuery.error instanceof Error ? allUsersQuery.error.message : null,
    refreshInvitableUsers,
    isMobileSidebarOpen,
    isNarrowViewport,
    isSecondarySurfaceViewport,
    manage,
    memberDialog,
    messages,
    messagesQuery,
    hasMoreOlderMessages: Boolean(olderMessagesCursor),
    mode,
    isLoadingOlderMessages,
    navigateToGroup: navigation.navigateToGroup,
    notice: dialogs.notice,
    onEditMessage: mutations.onEditMessage,
    onRevokeMessage: mutations.onRevokeMessage,
    openChannelSettings: openChannelSettingsForGroup,
    openInfoSidebar: navigation.openAuxSidebar,
    openInviteMembers: openChannelSettingsForGroup,
    mentionMember,
    openMemberProfile: dialogs.openMemberDialog,
    openMobileSidebar: navigation.openMobileSidebar,
    openServerCreateDialog: dialogs.openServerCreateDialog,
    openServerSettingsDialog: dialogs.openServerSettingsDialog,
    onArchiveServer: requestArchiveServer,
    requestHideServer,
    onJoinGroup: (groupId: string) => {
      void joinGroupMutation.mutateAsync(groupId);
    },
    onJoinCurrentGroup: () => {
      if (selectedGroupId) void joinGroupMutation.mutateAsync(selectedGroupId);
    },
    onMoveGroupToServer: mutations.onMoveGroupToServer,
    onSetWorkStatus: mutations.onSetWorkStatus,
    openStatusEditor: openChannelSettingsForGroup,
    replyToMessageId,
    loadOlderMessages,
    requestArchiveGroup,
    requestLeaveGroup,
    requestRemoveMember,
    requestInvitableUsers,
    selectedServerName,
    selectedServerId,
    selectedGroup,
    selectedGroupId,
    isDmAttendancePage,
    isDmMonthlyReportPage,
    isDmAlbumPage,
    isDmSubscriptionPage,
    isDmSpecialPage,
    dmAttendancePageId: DM_ATTENDANCE_PAGE_ID,
    dmSubscriptionPageId: DM_SUBSCRIPTION_PAGE_ID,
    serverDialog: {
      categoryStats:
        dialogs.serverDialogState?.mode === 'create' || !dialogs.serverDialogState
          ? null
          : buildServerStats(servers, dialogs.serverDialogState.serverId),
      createChannelName: dialogs.createChannelName,
      createServerName: dialogs.createServerName,
      currentServerName: dialogs.serverDialogState?.categoryName ?? selectedServerName,
      currentServerId: dialogs.serverDialogState?.serverId ?? selectedServerId,
      isOpen: Boolean(dialogs.serverDialogState),
      isSubmitting: mutations.serverDialogState.isSubmitting,
      mode: dialogs.serverDialogState?.mode ?? 'settings',
      onClose: () => dialogs.setServerDialogState(null),
      onCreateChannelNameChange: dialogs.setCreateChannelName,
      onCreateServerNameChange: dialogs.setCreateServerName,
      onRenameServerNameChange: dialogs.setRenameServerName,
      onSubmitCreate: mutations.serverDialogState.onSubmitCreate,
      onSubmitRename: mutations.serverDialogState.onSubmitRename,
      renameServerName: dialogs.renameServerName,
    },
    setReplyToMessageId,
    userSettingsDialog: dialogs.userSettingsDialog,
    openUserSettings: dialogs.openUserSettings,
    showCopiedNotice: dialogs.showCopiedNotice,
    showInfoNotice: dialogs.showInfoNotice,
    showErrorNotice: dialogs.showErrorNotice,
    startDMDialog: {
      isOpen: dialogs.isStartDMDialogOpen,
      users: dmCandidatesQuery.data ?? [],
      isLoading: dmCandidatesQuery.isLoading || dmCandidatesQuery.isFetching,
      onClose: () => dialogs.setIsStartDMDialogOpen(false),
      onDMStarted: dmActions.onDMStarted,
      onError: (message: string) => dialogs.pushNotice('error', message),
    },
    onStartNewDM: () => dialogs.setIsStartDMDialogOpen(true),
    dmCandidatesCount: dmCandidatesQuery.data?.length ?? 0,
    isDMCandidatesLoading: dmCandidatesQuery.isLoading,
    onCreateNewChannel: () => {
      dialogs.setCreateChannelInServerName('');
      dialogs.setIsCreateChannelDialogOpen(true);
    },
    createChannelDialog: {
      isOpen: dialogs.isCreateChannelDialogOpen,
      channelName: dialogs.createChannelInServerName,
      serverName: selectedServerName,
      isSubmitting: mutations.createChannelDialogState.isSubmitting,
      onClose: () => dialogs.setIsCreateChannelDialogOpen(false),
      onChannelNameChange: dialogs.setCreateChannelInServerName,
      onSubmit: mutations.createChannelDialogState.onSubmit,
    },
    workState: workStateQuery.data ?? null,
  };
}
