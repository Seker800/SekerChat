import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { BROWSER_COOKIE_CREDENTIAL } from '../../lib/api-core';
import { fetchSystemConfig } from '../../lib/system-config-api';
import { uploadUserAvatar } from '../../lib/groups-api';
import { resetOwnCheckInTodayForDev } from '../../lib/attendance-api';
import { ServerRail } from './ServerRail';
import { ChannelSidebar, type AttendanceReminderRequest } from './ChannelSidebar';
import { MessagePane } from './MessagePane';
import { canManageAttachmentShare } from './fileShareCapabilities';
import { Composer } from './Composer';
import { RightSidebar } from './RightSidebar';
import { StartDMDialog } from './StartDMDialog';
import { WorkspaceDialogs } from './WorkspaceDialogs';
import { DmAttendancePage } from './DmAttendancePage';
import { DmSubscriptionPage } from './DmSubscriptionPage';
import { DmAlbumPage } from './album/DmAlbumPage';
import { LazyAvatarCropDialog } from '../shared/LazyAvatarCropDialog';
import { useWorkspaceShellModel } from './useWorkspaceShellModel';
import {
  DM_ATTENDANCE_ROUTE,
  useWorkspaceStore,
  type WorkspaceMode,
} from '../../store/workspace-store';
import { getDmSpecialPage } from '../../store/dm-special-pages';
import { getSubscriptionSummary } from '../../lib/subscriptions-api';
import { getAlbumUpdateStatus } from '../../lib/album-api';
import {
  getDefaultRolePermissions,
  hasSystemPermission,
  isPackagingWorkStatus,
} from '@sekerchat/shared';
import { useWorkspaceFileDrop } from './useWorkspaceFileDrop';
import { useWorkspaceRealtimeController } from './useWorkspaceRealtimeController';
import { useWorkspaceSelectionRecovery } from './useWorkspaceSelectionRecovery';
import styles from './WorkspaceShell.module.css';

interface WorkspaceShellProps {
  mode?: WorkspaceMode;
}

function resolveCategoryLandingGroup(
  groups: Array<{
    id: string;
    serverId?: string | null;
    archivedAt?: string | null;
    updatedAt: string;
  }>,
  serverId: string,
) {
  const categoryGroups = groups
    .filter((group) => group.serverId === serverId)
    .sort(
      (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
    );

  return categoryGroups.find((group) => !group.archivedAt) ?? categoryGroups[0] ?? null;
}

export function WorkspaceShell({ mode = 'server' }: WorkspaceShellProps) {
  const { currentUser, logout } = useAuth();
  const accessToken = BROWSER_COOKIE_CREDENTIAL;
  const queryClient = useQueryClient();
  const currentUserMentionTargets = useMemo(
    () =>
      [
        currentUser.displayName?.trim() ?? '',
        currentUser.email.trim(),
        currentUser.email.split('@')[0]?.trim() ?? '',
      ].filter(Boolean),
    [currentUser.displayName, currentUser.email],
  );
  const systemConfigQuery = useQuery({
    queryKey: ['system-config'],
    queryFn: () => fetchSystemConfig(accessToken),
    staleTime: 30 * 1000,
    enabled: true,
  });
  const rolePermissions = systemConfigQuery.data?.rolePermissions ?? getDefaultRolePermissions();
  const model = useWorkspaceShellModel({
    accessToken,
    currentUser,
    mode,
    rolePermissions,
    chatAttachmentMaxMB: systemConfigQuery.data?.chatAttachmentMaxMB,
  });
  const navigate = useNavigate();
  const setWorkspaceMode = useWorkspaceStore((store) => store.setWorkspaceMode);
  const resetTodayCheckInMutation = useMutation({
    mutationFn: () => resetOwnCheckInTodayForDev(accessToken),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance', 'me', 'checkin', 'today'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'me', 'checkin-panel'] }),
        queryClient.invalidateQueries({ queryKey: ['attendance', 'me', 'panel'] }),
      ]);
      model.showInfoNotice(
        result.deletedCount > 0 ? '已清除今日打卡记录。' : '今日没有可清除的打卡记录。',
      );
    },
    onError: (error) => {
      model.showErrorNotice(error instanceof Error ? error.message : '清除今日打卡记录失败。');
    },
  });

  const { isDnd, setDndOverride } = useWorkspaceRealtimeController({
    currentUser,
    groups: model.groups,
    selectedGroupId: model.selectedGroupId,
    refreshGroupList: model.refreshGroupList,
  });
  const canCreateGroup = hasSystemPermission(rolePermissions, currentUser.role, 'create_group');
  const canManageGroupSettings = hasSystemPermission(
    rolePermissions,
    currentUser.role,
    'manage_group_settings',
  );
  const isSubscriptionAdmin = currentUser.role === 'ADMIN' || currentUser.role === 'SUPER_ADMIN';
  const canManageSubscriptions =
    isSubscriptionAdmin &&
    hasSystemPermission(rolePermissions, currentUser.role, 'manage_subscription_posts');
  const canManageAlbum = hasSystemPermission(rolePermissions, currentUser.role, 'manage_album');
  const subscriptionSummaryQuery = useQuery({
    queryKey: ['subscription-summary'],
    queryFn: () => getSubscriptionSummary(accessToken),
    enabled: mode === 'dm',
    staleTime: 15_000,
  });
  const albumUpdateStatusQuery = useQuery({
    queryKey: ['album', 'update-status'],
    queryFn: () => getAlbumUpdateStatus(accessToken),
    enabled: mode === 'dm',
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const [userAvatarFile, setUserAvatarFile] = useState<File | null>(null);
  const [attendanceReminderRequest, setAttendanceReminderRequest] =
    useState<AttendanceReminderRequest | null>(null);
  const userAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const { isFileDragActive, clearFileDragState, handleMessageDrop, handleMessageDragOver } =
    useWorkspaceFileDrop(model.composer.onPickAttachments, !model.isDmSpecialPage);

  const handleUserAvatarCropSave = useCallback(
    async (blob: Blob) => {
      setUserAvatarFile(null);
      try {
        await uploadUserAvatar(accessToken, blob);
        window.location.reload();
      } catch (error) {
        model.showErrorNotice(error instanceof Error ? error.message : '头像上传失败。');
      }
    },
    [accessToken, model],
  );

  const handleTriggerCheckoutReminder = useCallback(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    setAttendanceReminderRequest((current) => ({
      kind: 'checkout',
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }, []);

  const devHeaderControls = import.meta.env.DEV ? (
    <div className={styles.localDevControls}>
      <div className={styles.localDevBadge} data-testid="local-dev-badge">
        本地开发环境
      </div>
      <button
        type="button"
        className={styles.localDevActionButton}
        onClick={() => resetTodayCheckInMutation.mutate()}
        disabled={resetTodayCheckInMutation.isPending}
      >
        {resetTodayCheckInMutation.isPending ? '清理中' : '清除今日打卡'}
      </button>
      <button
        type="button"
        className={styles.localDevActionButton}
        onClick={handleTriggerCheckoutReminder}
      >
        触发签退提醒
      </button>
    </div>
  ) : null;

  const showServerEmptyState =
    mode === 'server' && !model.isServerGroupsLoading && !model.groups.length;
  const showDmEmptyState =
    mode === 'dm' && !model.isDmSpecialPage && !model.isLoading && !model.groups.length;
  const showInitialServerLoadingState =
    mode === 'server' && model.isServerGroupsLoading && !model.groups.length;
  const recoveryGroup =
    mode !== 'server'
      ? null
      : (model.categoryGroups[0] ?? model.activeGroups[0] ?? model.groups[0] ?? null);
  const {
    isRecoveringRequestedSelection: shouldRecoverInvalidRequestedSelection,
    isRecoveringServerSelection: shouldRecoverMissingServerSelection,
  } = useWorkspaceSelectionRecovery({
    mode,
    isLoading: model.isLoading,
    isServerGroupsLoading: model.isServerGroupsLoading,
    isSelectedGroupFetching: model.selectedGroupQuery.isFetching,
    isDmSpecialPage: model.isDmSpecialPage,
    groups: model.groups,
    requestedGroupId: model.requestedGroupId,
    selectedGroupId: model.selectedGroupId,
    selectedGroup: model.selectedGroup,
    recoveryGroup,
    navigateToGroup: model.navigateToGroup,
  });

  if (model.loadError) {
    return (
      <section className={styles.empty} data-testid="groups-workspace">
        <div data-testid="groups-load-error-state">
          <p>{model.loadError.source === 'servers' ? '群组加载失败' : '私聊加载失败'}</p>
          <p>{model.loadError.message}</p>
          <button onClick={model.retryLoadError}>重试</button>
        </div>
      </section>
    );
  }

  if (shouldRecoverMissingServerSelection) {
    return <div className={styles.empty}>正在恢复当前 server...</div>;
  }

  if (shouldRecoverInvalidRequestedSelection) {
    return (
      <div className={styles.empty}>
        {mode === 'dm' ? '正在恢复当前私聊...' : '正在恢复当前会话...'}
      </div>
    );
  }

  if (
    mode === 'server' &&
    !model.isServerGroupsLoading &&
    !model.selectedGroupQuery.isFetching &&
    model.groups.length > 0 &&
    !model.selectedGroup
  ) {
    return <div className={styles.empty}>无法加载当前 server。</div>;
  }

  return (
    <section
      className={`${styles.shell} ${model.isDmSpecialPage ? styles.shellWithoutAuxSidebar : ''}`}
      data-testid="groups-workspace"
    >
      <ServerRail
        categories={model.categoryRailItems}
        archivedCategories={model.archivedCategoryRailItems}
        selectedServerId={model.selectedServerId}
        accessToken={accessToken}
        isDMMode={mode === 'dm'}
        dmUnreadCount={model.dmUnreadCount}
        canManageServers={canCreateGroup || canManageGroupSettings}
        isOverlay={model.isNarrowViewport}
        isOverlayOpen={model.isMobileSidebarOpen}
        onOpenDM={() => {
          setWorkspaceMode('dm');
          void navigate(DM_ATTENDANCE_ROUTE);
        }}
        onSelect={(serverId) => {
          const fallbackGroup = resolveCategoryLandingGroup(model.servers, serverId);

          if (!fallbackGroup) {
            return;
          }

          if (mode === 'dm') {
            setWorkspaceMode('server');
            void navigate(`/groups/${fallbackGroup.id}`);
            return;
          }

          model.navigateToGroup(fallbackGroup.id, { keepMobileSidebarOpen: true });
        }}
        onOpenCreateServer={model.openServerCreateDialog}
        onOpenCategorySettings={model.openServerSettingsDialog}
      />
      <ChannelSidebar
        mode={model.mode}
        categoryName={model.selectedCategoryName}
        serverOptions={model.serverOptions}
        groups={model.categoryGroups}
        archivedGroups={model.archivedCategoryGroups}
        selectedGroupId={model.selectedGroupId}
        selectedSpecialPageId={model.isDmSpecialPage ? model.selectedGroupId : ''}
        subscriptionUnreadCount={subscriptionSummaryQuery.data?.pendingConfirmationCount ?? 0}
        albumHasUpdates={albumUpdateStatusQuery.data?.hasUpdates ?? false}
        isMobileSidebarOpen={model.isMobileSidebarOpen}
        currentUser={currentUser}
        onSelectGroup={(groupId) => model.navigateToGroup(groupId)}
        onSelectSpecialPage={(pageId) => {
          const page = getDmSpecialPage(pageId);
          if (!page) return;
          void navigate(page.route);
          model.closeMobileSidebar();
        }}
        onCloseMobileSidebar={model.closeMobileSidebar}
        onOpenChannelSettings={model.openChannelSettings}
        onOpenInviteMembers={model.openInviteMembers}
        onOpenStatusEditor={model.openStatusEditor}
        onSetWorkStatus={model.onSetWorkStatus}
        onChangeCategory={model.onChangeCategory}
        discoverableGroups={model.discoverableGroups}
        isSuperAdmin={model.isSuperAdmin}
        isJoiningGroup={model.isJoiningGroup}
        onRequestArchiveGroup={model.requestArchiveGroup}
        onJoinGroup={model.onJoinGroup}
        onOpenUserSettings={model.openUserSettings}
        onChangeUserAvatar={() => userAvatarInputRef.current?.click()}
        onStartNewDM={model.onStartNewDM}
        onCreateNewChannel={canCreateGroup ? model.onCreateNewChannel : undefined}
        workStatusDefs={systemConfigQuery.data?.workStatusDefs}
        rolePermissions={systemConfigQuery.data?.rolePermissions}
        currentUserRolePermissions={rolePermissions}
        currentUserIsDnd={isDnd}
        onDndChanged={setDndOverride}
        attendanceReminderRequest={attendanceReminderRequest}
      />
      <button
        className={`${styles.sidebarBackdrop} ${model.isMobileSidebarOpen ? styles.sidebarBackdropVisible : ''}`}
        data-testid="sidebar-backdrop"
        aria-label="关闭工作区侧栏"
        onClick={model.closeMobileSidebar}
        type="button"
      />
      {!model.isDmSpecialPage ? (
        <button
          className={`${styles.rightSidebarBackdrop} ${model.isSecondarySurfaceViewport && model.isAuxSidebarOpen ? styles.rightSidebarBackdropVisible : ''}`}
          data-testid="right-sidebar-backdrop"
          aria-label="关闭次级面板"
          onClick={model.closeAuxSidebar}
          type="button"
        />
      ) : null}
      <div
        className={`${styles.mainColumn} ${isFileDragActive ? styles.mainColumnDragOver : ''}`}
        onDragOver={handleMessageDragOver}
        onDrop={handleMessageDrop}
        data-testid="message-drop-zone"
      >
        {isFileDragActive ? <div className={styles.dragOverlay}>拖拽到消息栏发送附件</div> : null}
        {showServerEmptyState ? (
          <section className={styles.emptyMain}>
            <h2>欢迎使用 SekerChat</h2>
            <p>
              {canCreateGroup
                ? '你还没有加入任何 server，创建一个吧。'
                : '你还没有加入任何 server，且当前角色没有创建权限。'}
            </p>
            <button
              className={styles.createFirstButton}
              onClick={model.openServerCreateDialog}
              disabled={!canCreateGroup}
            >
              {canCreateGroup ? '创建第一个 Server' : '暂无创建 Server 权限'}
            </button>
          </section>
        ) : showInitialServerLoadingState ? (
          <section className={styles.emptyMain}>
            <h2>正在加载 server 列表</h2>
            <p>频道栏和消息栏会在数据返回后自动补齐。</p>
          </section>
        ) : showDmEmptyState ? (
          <section className={styles.emptyMain}>
            <h2>还没有私聊会话</h2>
            <p>
              {model.isDMCandidatesLoading
                ? '正在加载可私聊的用户...'
                : model.dmCandidatesCount > 0
                  ? '系统里已有其他用户，先发起一个私聊吧。'
                  : '系统中暂无其他可私聊用户，请等待其他用户注册或管理员邀请。'}
            </p>
            <button
              className={styles.createFirstButton}
              onClick={model.onStartNewDM}
              disabled={model.isDMCandidatesLoading || model.dmCandidatesCount === 0}
            >
              {model.dmCandidatesCount > 0 ? '新建私聊' : '暂无可私聊用户'}
            </button>
          </section>
        ) : model.isDmAttendancePage ? (
          <>
            <header className={styles.header}>
              {model.isNarrowViewport ? (
                <button
                  className={styles.headerToggle}
                  data-testid="sidebar-toggle-button"
                  onClick={model.openMobileSidebar}
                  type="button"
                >
                  频道栏
                </button>
              ) : null}
              <div className={styles.headerTitle}>
                <div className={styles.channelName}>{model.header.channelName}</div>
                <div className={styles.channelMeta}>{model.header.channelMeta}</div>
              </div>
              <div className={styles.headerActions}>
                {devHeaderControls}
                <div className={styles.headerStatus}>{model.header.userLabel}</div>
              </div>
            </header>
            <DmAttendancePage accessToken={accessToken} />
          </>
        ) : model.isDmAlbumPage ? (
          <>
            <header className={styles.header}>
              {model.isNarrowViewport ? (
                <button
                  className={styles.headerToggle}
                  data-testid="sidebar-toggle-button"
                  onClick={model.openMobileSidebar}
                  type="button"
                >
                  频道栏
                </button>
              ) : null}
              <div className={styles.headerTitle}>
                <div className={styles.channelName}>{model.header.channelName}</div>
                <div className={styles.channelMeta}>{model.header.channelMeta}</div>
              </div>
              <div className={styles.headerActions}>
                <div className={styles.headerStatus}>{model.header.userLabel}</div>
              </div>
            </header>
            <DmAlbumPage accessToken={accessToken} canManage={canManageAlbum} />
          </>
        ) : model.isDmSubscriptionPage ? (
          <>
            <header className={styles.header}>
              {model.isNarrowViewport ? (
                <button
                  className={styles.headerToggle}
                  data-testid="sidebar-toggle-button"
                  onClick={model.openMobileSidebar}
                  type="button"
                >
                  频道栏
                </button>
              ) : null}
              <div className={styles.headerTitle}>
                <div className={styles.channelName}>{model.header.channelName}</div>
                <div className={styles.channelMeta}>{model.header.channelMeta}</div>
              </div>
              <div className={styles.headerActions}>
                <div className={styles.headerStatus}>{model.header.userLabel}</div>
              </div>
            </header>
            <DmSubscriptionPage
              accessToken={accessToken}
              canManage={canManageSubscriptions}
              attachmentMaxMB={systemConfigQuery.data?.subscriptionAttachmentMaxMB}
            />
          </>
        ) : (
          <>
            <header className={styles.header}>
              {model.isNarrowViewport ? (
                <button
                  className={styles.headerToggle}
                  data-testid="sidebar-toggle-button"
                  onClick={model.openMobileSidebar}
                  type="button"
                >
                  频道栏
                </button>
              ) : null}
              <div className={styles.headerTitle}>
                <div className={styles.channelName}>{model.header.channelName}</div>
                <div className={styles.channelMeta}>{model.header.channelMeta}</div>
              </div>
              <div className={styles.headerActions}>
                {model.isSecondarySurfaceViewport ? (
                  <button
                    className={styles.headerToggle}
                    data-testid="open-info-sidebar-button"
                    onClick={model.openInfoSidebar}
                    type="button"
                  >
                    信息栏
                  </button>
                ) : null}
                {devHeaderControls}
                <div className={styles.headerStatus}>{model.header.userLabel}</div>
              </div>
            </header>
            <MessagePane
              activeGroupId={model.selectedGroupId}
              artifactAction={{
                isEnabled: isPackagingWorkStatus(
                  model.workState?.status ?? model.selectedGroup?.workState?.status,
                  systemConfigQuery.data?.workStatusDefs,
                ),
                isLocked: model.artifacts.isLocked,
                addedFileIds: model.artifacts.sourceFileIds,
                pendingFileIds: model.artifacts.pendingSourceFileIds,
                onAdd: model.artifacts.onAddFromMessage,
              }}
              messages={model.messages}
              currentUserId={currentUser.id}
              currentUserMentionTargets={currentUserMentionTargets}
              canManageFileShare={() => canManageAttachmentShare(model.selectedGroup)}
              isLoadingMessages={
                model.messagesQuery.isLoading ||
                (model.messagesQuery.isFetching && model.messages.length === 0)
              }
              messageLoadError={
                model.messagesQuery.error instanceof Error
                  ? `消息加载失败：${model.messagesQuery.error.message}`
                  : null
              }
              onVisibleLatestMessage={model.onVisibleLatestMessage}
              onLoadOlderMessages={model.loadOlderMessages}
              hasMoreOlderMessages={model.hasMoreOlderMessages}
              isLoadingOlderMessages={model.isLoadingOlderMessages}
              onReply={(messageId) => {
                model.setReplyToMessageId(model.replyToMessageId === messageId ? '' : messageId);
              }}
              onUnsupportedAction={model.showInfoNotice}
              onCopyMessage={model.showCopiedNotice}
              onEditMessage={model.onEditMessage}
              onRevokeMessage={model.onRevokeMessage}
              pendingUploads={model.pendingUploads}
              onClearPendingError={model.clearPendingError}
              onRetryPendingUpload={model.retryPendingUpload}
              onRetryPendingMessage={model.retryFailedMessage}
            />
            <Composer {...model.composer} />
          </>
        )}
      </div>
      {!model.isDmSpecialPage && model.selectedGroup ? (
        <RightSidebar
          group={model.selectedGroup}
          currentUserId={currentUser.id}
          isOverlay={model.isSecondarySurfaceViewport}
          isOpen={!model.isSecondarySurfaceViewport || model.isAuxSidebarOpen}
          isArtifactDropActive={isFileDragActive}
          onArtifactDropHandled={clearFileDragState}
          artifacts={model.artifacts}
          onOpenMemberProfile={model.openMemberProfile}
          onMentionMember={model.mentionMember}
          invitableUsers={model.invitableUsers}
          isInvitableUsersLoading={model.isInvitableUsersLoading}
          isInvitableUsersRefreshing={model.isInvitableUsersRefreshing}
          invitableUsersError={model.invitableUsersError}
          onRequestInvitableUsers={model.requestInvitableUsers}
          onRefreshInvitableUsers={model.refreshInvitableUsers}
          onRequestRemoveMember={model.requestRemoveMember}
          onLeaveGroup={model.requestLeaveGroup}
          onJoinGroup={model.onJoinCurrentGroup}
          onInviteByEmail={model.manage.onInviteByEmail}
          onClose={model.closeAuxSidebar}
          onShowNotice={(tone, text) => {
            if (tone === 'success') model.showCopiedNotice(text);
            else if (tone === 'error') model.showErrorNotice(text);
            else model.showInfoNotice(text);
          }}
          rolePermissions={systemConfigQuery.data?.rolePermissions}
          currentUserRole={currentUser.role}
        />
      ) : null}
      <WorkspaceDialogs
        group={model.selectedGroup}
        currentUserId={currentUser.id}
        currentUser={currentUser}
        manage={model.manage}
        channelDialog={model.channelDialog}
        serverDialog={model.serverDialog}
        memberDialog={model.memberDialog}
        confirmDialog={model.confirmDialog}
        userSettingsDialog={model.userSettingsDialog}
        createChannelDialog={model.createChannelDialog}
        isSuperAdmin={model.isSuperAdmin}
        onArchiveServer={model.onArchiveServer}
        onServerAvatarUploaded={() => {
          void model.refreshServerList();
          void model.selectedGroupQuery.refetch();
        }}
        onUserProfileUpdated={() => {
          window.location.reload();
        }}
        onLogout={logout}
        onShowNotice={(tone, text) => {
          if (tone === 'success') model.showCopiedNotice(text);
          else if (tone === 'error') model.showErrorNotice(text);
          else model.showInfoNotice(text);
        }}
      />
      <input
        ref={userAvatarInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          if (file) setUserAvatarFile(file);
          if (userAvatarInputRef.current) userAvatarInputRef.current.value = '';
        }}
      />
      {userAvatarFile ? (
        <LazyAvatarCropDialog
          file={userAvatarFile}
          onSave={handleUserAvatarCropSave}
          onCancel={() => setUserAvatarFile(null)}
        />
      ) : null}
      <StartDMDialog
        users={model.startDMDialog.users}
        currentUserId={currentUser.id}
        isOpen={model.startDMDialog.isOpen}
        isLoading={model.startDMDialog.isLoading}
        onClose={model.startDMDialog.onClose}
        onDMStarted={model.startDMDialog.onDMStarted}
        onError={model.startDMDialog.onError}
      />
      {model.notice ? (
        <div className={`${styles.notice} ${styles[`notice${model.notice.tone}`]}`}>
          {model.notice.text}
        </div>
      ) : null}
    </section>
  );
}
