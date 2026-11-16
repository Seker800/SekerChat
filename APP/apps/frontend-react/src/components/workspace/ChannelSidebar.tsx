import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import type { GroupResponse } from '../../lib/groups-api';
import type { CurrentUserResponse } from '../../lib/auth-api';
import { updateUserProfile } from '../../lib/auth-api';
import {
  compareWorkStatusPriority,
  getWorkStatusNames,
  getWorkStatusTextTone,
  getWorkStatusTone,
  normalizeGroupWorkStatus,
} from '../../lib/work-status';
import {
  NOTIFICATION_DISABLED_UNTIL_ISO,
  getDefaultRolePermissions,
  hasSystemPermission,
  type RolePermissions,
  type WorkStatusDef,
} from '@sekerchat/shared';
import { formatRelativeTime } from '../../utils/time';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { useSecondaryClickGuard } from './useSecondaryClickGuard';
import { Avatar } from '../shared/Avatar';
import { userDisplayName } from '../../lib/users-api';
import { useWorkspaceStore, type WorkspaceMode } from '../../store/workspace-store';
import {
  DM_SPECIAL_PAGES,
  DM_ALBUM_PAGE_ID,
  DM_SUBSCRIPTION_PAGE_ID,
} from '../../store/dm-special-pages';
import { useAttendanceDock, type AttendanceReminderRequest } from './useAttendanceDock';
import { ChannelSidebarFooter } from './ChannelSidebarFooter';
import styles from './ChannelSidebar.module.css';
import { useTranslation } from 'react-i18next';

interface ChannelSidebarProps {
  mode: WorkspaceMode;
  serverName: string;
  serverOptions: Array<{ id: string; name: string }>;
  groups: GroupResponse[];
  archivedGroups: GroupResponse[];
  selectedSpecialPageId?: string;
  albumHasUpdates?: boolean;
  discoverableGroups?: { id: string; name: string; memberCount: number }[];
  isSuperAdmin?: boolean;
  isJoiningGroup?: boolean;
  selectedGroupId: string;
  isMobileSidebarOpen: boolean;
  currentUser: CurrentUserResponse;
  accessToken?: string;
  onSelectGroup: (groupId: string) => void;
  onSelectSpecialPage?: (pageId: string) => void;
  onCloseMobileSidebar: () => void;
  onOpenChannelSettings: (groupId: string) => void;
  onOpenInviteMembers: (groupId: string) => void;
  onOpenStatusEditor: (groupId: string) => void;
  onSetWorkStatus: (groupId: string, status: string) => void;
  onMoveGroupToServer: (groupId: string, serverId: string) => void;
  onRequestArchiveGroup: (groupId: string) => void;
  onJoinGroup?: (groupId: string) => void;
  onOpenUserSettings: (initialMode?: 'summary' | 'editDisplayName') => void;
  onChangeUserAvatar?: () => void;
  onStartNewDM?: () => void;
  onCreateNewChannel?: () => void;
  workStatusDefs?: WorkStatusDef[];
  rolePermissions?: RolePermissions | null;
  currentUserRolePermissions?: RolePermissions | null;
  currentUserIsDnd: boolean;
  onDndChanged?: (isDnd: boolean) => void;
  attendanceReminderRequest?: AttendanceReminderRequest | null;
}

export function ChannelSidebar({
  mode,
  serverName,
  serverOptions,
  groups,
  archivedGroups,
  selectedSpecialPageId = '',
  albumHasUpdates = false,
  discoverableGroups,
  isSuperAdmin = false,
  isJoiningGroup = false,
  selectedGroupId,
  isMobileSidebarOpen,
  currentUser,
  accessToken,
  onSelectGroup,
  onSelectSpecialPage,
  onCloseMobileSidebar,
  onOpenChannelSettings,
  onOpenInviteMembers,
  onOpenStatusEditor,
  onSetWorkStatus,
  onMoveGroupToServer,
  onRequestArchiveGroup,
  onJoinGroup,
  onOpenUserSettings,
  onChangeUserAvatar,
  onStartNewDM,
  onCreateNewChannel,
  workStatusDefs,
  rolePermissions,
  currentUserRolePermissions,
  currentUserIsDnd,
  onDndChanged,
  attendanceReminderRequest,
}: ChannelSidebarProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN';
  const resolvedAccessToken = useResolvedAccessToken(accessToken);
  const attendanceDock = useAttendanceDock({
    accessToken: resolvedAccessToken,
    reminderRequest: attendanceReminderRequest,
  });
  const [menuState, setMenuState] = useState<{ group: GroupResponse; x: number; y: number } | null>(
    null,
  );
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [discoverableExpanded, setDiscoverableExpanded] = useState(false);
  const { markSecondaryClick, shouldSuppressClick } = useSecondaryClickGuard();
  const handleCloseMenu = useCallback(() => setMenuState(null), []);
  const isDMMode = mode === 'dm';
  const rp = currentUserRolePermissions ?? rolePermissions ?? getDefaultRolePermissions();
  const canCreateChannel = hasSystemPermission(rp, currentUser.role, 'create_group');
  const canAccessAdmin = hasSystemPermission(rp, currentUser.role, 'access_admin_page');
  const [optimisticIsDnd, setOptimisticIsDnd] = useState<boolean | null>(null);

  useEffect(() => {
    setOptimisticIsDnd(null);
  }, [currentUserIsDnd]);

  const isDnd = optimisticIsDnd ?? currentUserIsDnd;

  const handleToggleDnd = useCallback(async () => {
    const next = isDnd ? null : NOTIFICATION_DISABLED_UNTIL_ISO;
    setOptimisticIsDnd(!isDnd);
    try {
      await updateUserProfile(resolvedAccessToken, { dndUntil: next });
      onDndChanged?.(next !== null);
    } catch (error) {
      console.error('DnD toggle failed:', error);
      setOptimisticIsDnd(null);
    }
  }, [resolvedAccessToken, isDnd, onDndChanged]);

  const hiddenDmIds = useWorkspaceStore((s) => s.hiddenDmIds);
  const hideDm = useWorkspaceStore((s) => s.hideDm);
  const unhideDm = useWorkspaceStore((s) => s.unhideDm);

  const visibleDmGroups = useMemo(
    () => (isDMMode ? groups.filter((g) => !hiddenDmIds.includes(g.id)) : groups),
    [isDMMode, groups, hiddenDmIds],
  );

  const sortedGroups = useMemo(
    () =>
      [...(isDMMode ? visibleDmGroups : groups)].sort((left, right) => {
        const statusOrder = compareWorkStatusPriority(
          left.workState?.status,
          right.workState?.status,
          workStatusDefs,
        );

        if (statusOrder !== 0) {
          return statusOrder;
        }

        const leftTs = new Date(left.updatedAt).getTime();
        const rightTs = new Date(right.updatedAt).getTime();
        return rightTs - leftTs;
      }),
    [isDMMode, visibleDmGroups, groups, workStatusDefs],
  );

  const sortedArchivedGroups = useMemo(() => {
    const withTs = archivedGroups.map((g) => ({ g, ts: new Date(g.updatedAt).getTime() }));
    withTs.sort((a, b) => b.ts - a.ts);
    return withTs.map(({ g }) => g);
  }, [archivedGroups]);

  const menuItems: ContextMenuItem[] = useMemo(() => {
    if (isDMMode) return [];
    if (!menuState) return [];

    const currentStatus =
      normalizeGroupWorkStatus(menuState.group.workState?.status, workStatusDefs) || '初始';
    const isArchived = !!menuState.group.archivedAt;
    const statusNames = getWorkStatusNames(workStatusDefs);

    const canManageStatus = hasSystemPermission(rp, currentUser.role, 'manage_work_status');
    const canManageCategory = hasSystemPermission(rp, currentUser.role, 'manage_group_settings');
    const canArchive = hasSystemPermission(rp, currentUser.role, 'archive_group');

    const actions: ContextMenuItem[] = [
      {
        key: 'open-channel-settings',
        label: t('navigation.openChannelSettings'),
        onSelect: () => onOpenChannelSettings(menuState.group.id),
      },
    ];

    if (canManageCategory) {
      actions.push({
        key: 'adjust-category' as const,
        label: t('navigation.adjustCategory'),
        separatorBefore: true,
        onSelect: () => {},
        subItems: serverOptions.map((server) => ({
          key: `set-server-${server.id}`,
          label: server.name,
          disabled: server.id === menuState.group.serverId,
          hint: server.id === menuState.group.serverId ? t('navigation.current') : undefined,
          onSelect: () => onMoveGroupToServer(menuState.group.id, server.id),
        })),
      });
    }

    if (canManageStatus) {
      actions.push({
        key: 'adjust-status' as const,
        label: t('navigation.adjustStatus'),
        hint: currentStatus,
        separatorBefore: true,
        onSelect: () => {},
        subItems: statusNames.map((status) => ({
          key: `set-status-${status}`,
          label: status,
          disabled: status === currentStatus,
          hint: status === currentStatus ? t('navigation.current') : undefined,
          onSelect: () => onSetWorkStatus(menuState.group.id, status),
        })),
      });
    }

    if (canArchive) {
      actions.push({
        key: 'archive-group' as const,
        label: isArchived ? t('navigation.unarchiveChannel') : t('navigation.archiveChannel'),
        danger: !isArchived,
        separatorBefore: true,
        onSelect: () => onRequestArchiveGroup(menuState.group.id),
      });
    }

    return actions;
  }, [
    isDMMode,
    menuState,
    serverOptions,
    workStatusDefs,
    rp,
    currentUser.role,
    onOpenChannelSettings,
    onSetWorkStatus,
    onMoveGroupToServer,
    onRequestArchiveGroup,
    t,
  ]);

  function openContextMenu(group: GroupResponse, x: number, y: number) {
    if (isDMMode) {
      return;
    }

    markSecondaryClick();
    setMenuState({ group, x, y });
  }

  function handleGroupClick(group: GroupResponse, event: React.MouseEvent) {
    if (shouldSuppressClick()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (isDMMode) {
      unhideDm(group.id);
    }
    onSelectGroup(group.id);
    onCloseMobileSidebar();
  }

  function handleGroupMouseDown(group: GroupResponse, event: React.MouseEvent) {
    if (!event.ctrlKey || event.button !== 0) return;
    event.preventDefault();
    openContextMenu(group, event.clientX, event.clientY);
  }

  function handleGroupContextMenu(group: GroupResponse, event: React.MouseEvent) {
    event.preventDefault();
    openContextMenu(group, event.clientX, event.clientY);
  }

  function getDmPartner(group: GroupResponse) {
    return (
      group.members.find((member) => member.userId !== currentUser.id) ?? group.members[0] ?? null
    );
  }

  function dmPreview(group: GroupResponse): string {
    const msg = group.latestMessage;
    if (!msg?.text) return formatRelativeTime(group.updatedAt, language);
    const prefix = msg.senderId === currentUser.id ? t('navigation.youPrefix') : '';
    const text = msg.text.length > 42 ? msg.text.slice(0, 42) + '...' : msg.text;
    return prefix + text;
  }

  return (
    <aside
      className={`${styles.sidebar} ${isMobileSidebarOpen ? styles.sidebarVisible : ''}`}
      data-testid="groups-sidebar"
    >
      <div className={styles.header}>
        <span className={styles.headerTitle} title={serverName}>
          {isDMMode ? t('navigation.inbox') : serverName}
        </span>
        <div className={styles.headerActions}>
          {isDMMode && onStartNewDM ? (
            <button
              className={styles.headerAddButton}
              type="button"
              onClick={onStartNewDM}
              title={t('navigation.newDm')}
              aria-label={t('navigation.newDm')}
            >
              +
            </button>
          ) : null}
          {!isDMMode && onCreateNewChannel && canCreateChannel ? (
            <button
              className={styles.headerAddButton}
              type="button"
              onClick={onCreateNewChannel}
              title={t('navigation.newChannel')}
              aria-label={t('navigation.newChannel')}
            >
              +
            </button>
          ) : null}
          <button
            className={`${styles.headerButton} ${styles.closeButton}`}
            data-testid="sidebar-close-button"
            hidden={!isMobileSidebarOpen}
            onClick={onCloseMobileSidebar}
          >
            {t('common.close')}
          </button>
        </div>
      </div>
      <div className={styles.section}>
        {isDMMode ? (
          <div className={styles.specialSection}>
            <div className={styles.sectionTitle}>{t('navigation.features')}</div>
            {DM_SPECIAL_PAGES.map((page) => (
              <button
                key={page.id}
                className={`${styles.groupRow} ${styles.specialRow} ${selectedSpecialPageId === page.id ? styles.groupRowActive : ''}`}
                type="button"
                onClick={() => {
                  onSelectSpecialPage?.(page.id);
                  onCloseMobileSidebar();
                }}
              >
                <div className={styles.groupRowHeader}>
                  <strong className={styles.groupName}>
                    <span>
                      {t(page.labelKey)}
                    </span>
                  </strong>
                  {page.id === DM_ALBUM_PAGE_ID && albumHasUpdates ? (
                    <span className={styles.updateDot} aria-label={t('navigation.albumUpdated')} />
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.sectionTitle}>
          {isDMMode ? t('navigation.conversations') : t('navigation.channels')}
        </div>
        <div className={styles.groupList} data-testid="category-group-list">
          {isDMMode
            ? sortedGroups.map((group) => {
                const partner = getDmPartner(group);
                const partnerName = partner ? userDisplayName(partner) : group.name;

                return (
                  <button
                    key={group.id}
                    className={`${styles.groupRow} ${styles.dmRow} ${selectedGroupId === group.id ? styles.groupRowActive : ''}`}
                    data-group-id={group.id}
                    onClick={(e) => handleGroupClick(group, e)}
                  >
                    <Avatar
                      avatarUrl={partner?.avatarUrl ?? null}
                      name={partnerName}
                      size={32}
                      accessToken={resolvedAccessToken}
                      isOnline={partner?.isOnline ?? false}
                      isDnd={partner?.isDnd ?? false}
                    />
                    <div className={styles.dmRowContent}>
                      <div className={styles.groupRowHeader}>
                        <strong className={styles.groupName}>
                          <span>{partnerName}</span>
                        </strong>
                        {group.unreadCount > 0 && (
                          <span className={styles.unreadBadge}>
                            {group.unreadCount > 99 ? '99+' : group.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className={styles.currentThreadMeta}>{dmPreview(group)}</div>
                    </div>
                    <span
                      className={styles.dmCloseButton}
                      role="button"
                      aria-label={t('navigation.closeDm')}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        hideDm(group.id);
                      }}
                    >
                      &times;
                    </span>
                  </button>
                );
              })
            : sortedGroups.map((group) => {
                const hasStatus = !!group.workState?.status;
                const workStatus = normalizeGroupWorkStatus(
                  group.workState?.status,
                  workStatusDefs,
                );
                const workStatusTone = getWorkStatusTone(workStatus, workStatusDefs);
                const workStatusTextTone = getWorkStatusTextTone(workStatus, workStatusDefs);

                return (
                  <button
                    key={group.id}
                    className={`${styles.groupRow} ${selectedGroupId === group.id ? styles.groupRowActive : ''}`}
                    data-group-id={group.id}
                    onMouseDown={(e) => handleGroupMouseDown(group, e)}
                    onClick={(e) => handleGroupClick(group, e)}
                    onContextMenu={(e) => handleGroupContextMenu(group, e)}
                  >
                    {group.unreadCount > 0 && (
                      <span className={styles.unreadBadge}>
                        {group.unreadCount > 99 ? '99+' : group.unreadCount}
                      </span>
                    )}
                    <div className={styles.groupRowHeader}>
                      <strong className={styles.groupName}>
                        <span>{group.name}</span>
                      </strong>
                    </div>
                    <div className={styles.currentThreadMeta}>
                      {hasStatus ? (
                        <span
                          className={styles.statusBadge}
                          style={{ backgroundColor: workStatusTone, color: workStatusTextTone }}
                        >
                          {workStatus}
                        </span>
                      ) : null}
                      {group.artifactConfirmation.isConfirmed ? (
                        <span className={styles.confirmedMarker} title={t('navigation.packaged')}>
                          {t('navigation.packaged')}
                        </span>
                      ) : null}
                      <span>{t('navigation.memberCount', { count: group.memberCount ?? group.members.length })}</span>
                      <span className={styles.groupMetaTime}>
                        {formatRelativeTime(group.updatedAt, language)}
                      </span>
                    </div>
                  </button>
                );
              })}
        </div>
        {!isDMMode && sortedArchivedGroups.length ? (
          <>
            <div
              className={styles.sectionTitle}
              style={{
                cursor: 'pointer',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              onClick={() => setArchivedExpanded((v) => !v)}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                style={{
                  transform: archivedExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.15s',
                }}
              >
                <path
                  d="M3 1L8 5L3 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t('navigation.archived', { count: sortedArchivedGroups.length })}
            </div>
            {archivedExpanded ? (
              <div className={styles.groupList}>
                {sortedArchivedGroups.map((group) => {
                  const hasStatus = !!group.workState?.status;
                  const workStatus = normalizeGroupWorkStatus(
                    group.workState?.status,
                    workStatusDefs,
                  );
                  const workStatusTone = getWorkStatusTone(workStatus, workStatusDefs);
                  const workStatusTextTone = getWorkStatusTextTone(workStatus, workStatusDefs);

                  return (
                    <button
                      key={group.id}
                      className={`${styles.groupRow} ${selectedGroupId === group.id ? styles.groupRowActive : ''}`}
                      data-group-id={group.id}
                      onMouseDown={(e) => handleGroupMouseDown(group, e)}
                      onClick={(e) => handleGroupClick(group, e)}
                      onContextMenu={(e) => handleGroupContextMenu(group, e)}
                    >
                      <div className={styles.groupRowHeader}>
                        <strong className={styles.groupName}>
                          <span>{group.name}</span>
                        </strong>
                      </div>
                      <div className={styles.currentThreadMeta}>
                        {hasStatus ? (
                          <span
                            className={styles.statusBadge}
                            style={{ backgroundColor: workStatusTone, color: workStatusTextTone }}
                          >
                            {workStatus}
                          </span>
                        ) : null}
                        {group.artifactConfirmation.isConfirmed ? (
                          <span className={styles.confirmedMarker} title={t('navigation.packaged')}>
                            {t('navigation.packaged')}
                          </span>
                        ) : null}
                        <span>{t('navigation.memberCount', { count: group.memberCount ?? group.members.length })}</span>
                        <span className={styles.groupMetaTime}>
                          {formatRelativeTime(group.updatedAt, language)}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}

        {isSuperAdmin && discoverableGroups && discoverableGroups.length > 0 ? (
          <>
            <div
              className={styles.sectionTitle}
              style={{
                cursor: 'pointer',
                userSelect: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
              onClick={() => setDiscoverableExpanded((v) => !v)}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                style={{
                  transform: discoverableExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.15s',
                }}
              >
                <path
                  d="M3 1L8 5L3 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t('navigation.notJoined', { count: discoverableGroups.length })}
            </div>
            {discoverableExpanded ? (
              <div className={styles.groupList}>
                {discoverableGroups.map((group) => {
                  const workState =
                    'workState' in group ? (group.workState as { status: string } | null) : null;
                  const hasStatus = !!workState?.status;
                  const workStatus = hasStatus
                    ? normalizeGroupWorkStatus(workState!.status, workStatusDefs) ||
                      workState!.status
                    : null;
                  const workStatusTone = workStatus
                    ? getWorkStatusTone(workStatus, workStatusDefs)
                    : undefined;
                  const workStatusTextTone = workStatus
                    ? getWorkStatusTextTone(workStatus, workStatusDefs)
                    : undefined;

                  return (
                    <button
                      key={group.id}
                      className={`${styles.groupRow} ${selectedGroupId === group.id ? styles.groupRowActive : ''}`}
                      onClick={() => onSelectGroup(group.id)}
                      title={`${group.name} · ${t('navigation.memberCount', { count: group.memberCount ?? 0 })}`}
                    >
                      <div className={styles.groupRowHeader}>
                        <strong className={styles.groupName}>
                          <span>{group.name}</span>
                        </strong>
                      </div>
                      <div className={styles.currentThreadMeta}>
                        {hasStatus ? (
                          <span
                            className={styles.statusBadge}
                            style={{ backgroundColor: workStatusTone, color: workStatusTextTone }}
                          >
                            {workStatus}
                          </span>
                        ) : null}
                        <span>{t('navigation.memberCount', { count: group.memberCount ?? 0 })}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
      <ChannelSidebarFooter
        accessToken={resolvedAccessToken}
        currentUser={currentUser}
        isDnd={isDnd}
        canAccessAdmin={canAccessAdmin}
        {...attendanceDock}
        onChangeUserAvatar={() => {
          if (onChangeUserAvatar) onChangeUserAvatar();
          else onOpenUserSettings();
        }}
        onOpenDisplayNameSettings={() => onOpenUserSettings('editDisplayName')}
        onToggleDnd={handleToggleDnd}
      />
      <ContextMenu
        items={menuItems}
        position={menuState ? { x: menuState.x, y: menuState.y } : null}
        onClose={handleCloseMenu}
      />
    </aside>
  );
}
