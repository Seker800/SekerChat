import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { CurrentUserResponse } from '../../lib/auth-api';
import {
  adminJoinGroup,
  leaveGroup,
  listAdminDiscoverableGroups,
  type GroupResponse,
} from '../../lib/groups-api';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useWorkspaceStore, type WorkspaceMode } from '../../store/workspace-store';
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
import { buildServerStats, DEFAULT_CATEGORY, useServerCategories } from './useServerCategories';
import { useWorkspaceDialogs } from './useWorkspaceDialogs';
import { useWorkspaceMutations } from './useWorkspaceMutations';
import { useWorkspaceNavigation } from './useWorkspaceNavigation';
import { useWorkspaceQueries } from './useWorkspaceQueries';
import { hasSystemPermission, type RolePermissions } from '@sekerchat/shared';

interface WorkspaceShellModelProps {
  accessToken: string;
  currentUser: CurrentUserResponse;
  mode?: WorkspaceMode;
  rolePermissions?: RolePermissions | null;
  chatAttachmentMaxMB?: number;
}

export { DEFAULT_CATEGORY };

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
  const {
    setReplyToMessageId,
    setWorkspaceMode,
    unhideDm: unhideDmFromStore,
  } = useWorkspaceStore();
  const dialogs = useWorkspaceDialogs({
    currentUser,
  });
  const resolvedRolePermissions = rolePermissions ?? null;
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
    isSuperAdmin,
    shouldLoadInvitableUsers: hasRequestedInvitableUsers,
    isStartDMDialogOpen: dialogs.isStartDMDialogOpen,
    mode,
    routeDmId: params.dmId,
    routeGroupId: params.groupId,
  });

  const {
    allUsersQuery,
    artifactsQuery,
    channels,
    channelsQuery,
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
    isDmAlbumPage,
    isDmSubscriptionPage,
    isDmSpecialPage,
  } = workspaceQueries;
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

  const serverCategories = useServerCategories({
    channels,
    selectedGroup: selectedGroup ?? undefined,
    servers,
  });

  const {
    activeChannels,
    archivedCategoryGroups,
    archivedCategoryRailItems,
    categoryGroups,
    categoryNames,
    categoryRailItems,
    selectedCategoryName,
    selectedServerId,
    serverOptions,
  } = serverCategories;

  const discoverableQuery = useQuery({
    queryKey: ['admin-discovery', 'former', selectedServerId],
    queryFn: () =>
      listAdminDiscoverableGroups(accessToken, { scope: 'former', serverId: selectedServerId }),
    enabled: isSuperAdmin && mode === 'server' && Boolean(selectedServerId),
    staleTime: 0,
  });

  const joinGroupMutation = useMutation({
    mutationFn: (groupId: string) => adminJoinGroup(accessToken, groupId),
    onSuccess: async () => {
      dialogs.pushNotice('success', '已加入频道。');
      await discoverableQuery.refetch();
      await channelsQuery.refetch();
      await serversQuery.refetch();
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
    refetchGroup: () => void selectedGroupQuery.refetch(),
    refetchGroups: () => void channelsQuery.refetch(),
    refetchWorkState: () => void workStateQuery.refetch(),
    refetchUsers: () => {
      void allUsersQuery.refetch();
    },
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

  const { artifacts } = useArtifacts({
    accessToken,
    selectedGroupId,
    selectedGroup: selectedGroup ?? undefined,
    items: artifactsQuery.data ?? [],
    onError: (message) => dialogs.pushNotice('error', message),
    onSuccess: (message) => dialogs.pushNotice('success', message),
    refetchArtifacts: async () => {
      await artifactsQuery.refetch();
    },
    refetchGroup: async () => {
      await selectedGroupQuery.refetch();
    },
  });

  const mutations = useWorkspaceMutations({
    accessToken,
    channelsQuery,
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

      const group = channels.find((item) => item.id === groupId);
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
    [channels, dialogs, mode, mutations.archiveGroupMutation, navigation, selectedGroupId],
  );

  const requestArchiveServer = useCallback(
    (serverId: string) => {
      const server = [...categoryRailItems, ...archivedCategoryRailItems].find(
        (item) => item.id === serverId,
      );
      if (!server) return;
      const isArchived = server.isArchived;

      dialogs.setConfirmDialog({
        title: isArchived ? '取消归档 Server' : '归档 Server',
        description: isArchived
          ? `确认恢复 Server「${server.name}」？其下所有频道也将恢复为可协作状态。`
          : `确认归档 Server「${server.name}」？其下所有频道将被设为只读。`,
        confirmLabel: isArchived ? '取消归档' : '确认归档',
        isDanger: !isArchived,
        onConfirm: () => {
          dialogs.setConfirmDialog(null);
          void mutations.archiveCategoryMutation.mutateAsync({ serverId, archive: !isArchived });
        },
      });
    },
    [archivedCategoryRailItems, categoryRailItems, dialogs, mutations.archiveCategoryMutation],
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
          await channelsQuery.refetch();
          await serversQuery.refetch();
          // Navigate to next group in same server, fallback to any other
          const sameServer = channels.find(
            (group) => group.id !== selectedGroupId && group.serverId === selectedServerId,
          );
          const next = sameServer ?? channels.find((g) => g.id !== selectedGroupId);
          if (next) navigation.navigateToGroup(next.id);
        } catch (error) {
          dialogs.pushNotice('error', error instanceof Error ? error.message : '退出频道失败。');
        }
      },
    });
  }, [
    accessToken,
    channels,
    channelsQuery,
    dialogs,
    discoverableQuery,
    navigation,
    selectedGroupId,
    selectedServerId,
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
    activeGroups: activeChannels,
    archivedCategoryGroups,
    archivedCategoryRailItems,
    artifacts,
    categoryGroups,
    categoryNames,
    categoryRailItems,
    serverOptions,
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
    groups: channels,
    groupsQuery: channelsQuery,
    isLoading: serversQuery.isLoading || (mode === 'dm' && workspaceQueries.dmsQuery.isLoading),
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
    isServerGroupsLoading: serversQuery.isLoading,
    refreshGroupList: () => {
      void channelsQuery.refetch();
    },
    refreshServerList: () => {
      void serversQuery.refetch();
    },
    requestedGroupId,
    selectedGroupQuery,
    header: {
      channelMeta:
        mode === 'dm'
          ? (dmSpecialPage?.description ?? '收件箱')
          : `${selectedCategoryName} · ${selectedGroup?.memberCount ?? selectedGroup?.members.length ?? 0} 人 · ${selectedGroup?.archivedAt ? '只读' : '可协作'}`,
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
    onJoinGroup: (groupId: string) => {
      void joinGroupMutation.mutateAsync(groupId);
    },
    onJoinCurrentGroup: () => {
      if (selectedGroupId) void joinGroupMutation.mutateAsync(selectedGroupId);
    },
    onChangeCategory: mutations.onChangeCategory,
    onSetWorkStatus: mutations.onSetWorkStatus,
    openStatusEditor: openChannelSettingsForGroup,
    replyToMessageId,
    loadOlderMessages,
    requestArchiveGroup,
    requestLeaveGroup,
    requestRemoveMember,
    requestInvitableUsers,
    selectedCategoryName,
    selectedServerId,
    selectedGroup,
    selectedGroupId,
    isDmAttendancePage,
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
      currentCategoryName: dialogs.serverDialogState?.categoryName ?? selectedCategoryName,
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
      serverName: selectedCategoryName,
      isSubmitting: mutations.createChannelDialogState.isSubmitting,
      onClose: () => dialogs.setIsCreateChannelDialogOpen(false),
      onChannelNameChange: dialogs.setCreateChannelInServerName,
      onSubmit: mutations.createChannelDialogState.onSubmit,
    },
    workState: workStateQuery.data ?? null,
  };
}
