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
import { useOwnCheckInController } from './useOwnCheckInController';
import { ChannelSidebarFooter } from './ChannelSidebarFooter';
import styles from './ChannelSidebar.module.css';

const DISPLAY_TIMEZONE = 'Asia/Shanghai';
const CHECKOUT_REMINDER_MINUTES = 8 * 60;
const EVENING_REMINDER_MINUTES = 17 * 60 + 30;
const ATTENDANCE_PANEL_AUTO_OPEN_DELAY_MS = 650;
const ATTENDANCE_PANEL_EXIT_MS = 240;
const ATTENDANCE_ACTION_MIN_PROGRESS_MS = 1500;
const ATTENDANCE_ACTION_SUCCESS_MS = 520;
type AttendanceActionKind = 'checkin' | 'checkout';

type AttendancePanelState = {
  promptKey: string | null;
  shouldPrompt: boolean;
};

export interface AttendanceReminderRequest {
  kind: 'checkin' | 'checkout';
  nonce: number;
}

function getShanghaiMinutesNow(now: Date): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return Number(parts.hour ?? '0') * 60 + Number(parts.minute ?? '0');
}

function getCheckInDurationMinutes(
  today: NonNullable<ReturnType<typeof useOwnCheckInController>['today']>,
  now: Date,
  lastUpdatedAtMs: number,
): number {
  if (today.status !== 'CHECKED_IN') {
    return today.checkInMinutes;
  }

  const elapsedMinutesSinceSync = Math.max(
    0,
    Math.floor((now.getTime() - lastUpdatedAtMs) / 60_000),
  );
  return today.checkInMinutes + elapsedMinutesSinceSync;
}

function resolveAttendancePanelState(
  controller: ReturnType<typeof useOwnCheckInController>,
  now: Date,
): AttendancePanelState {
  if (controller.todayQuery.isLoading && !controller.today) {
    return {
      promptKey: null,
      shouldPrompt: false,
    };
  }

  if (controller.todayQuery.isError || !controller.today) {
    return {
      promptKey: null,
      shouldPrompt: false,
    };
  }

  if (controller.today.status === 'NOT_CHECKED_IN') {
    return {
      promptKey: `checkin:${controller.today.workDate}`,
      shouldPrompt: true,
    };
  }

  if (controller.today.status === 'CHECKED_OUT') {
    return {
      promptKey: null,
      shouldPrompt: false,
    };
  }

  const durationMinutes = getCheckInDurationMinutes(
    controller.today,
    now,
    controller.todayQuery.dataUpdatedAt,
  );
  const afterEveningReminderTime = getShanghaiMinutesNow(now) >= EVENING_REMINDER_MINUTES;
  const shouldPrompt = durationMinutes >= CHECKOUT_REMINDER_MINUTES || afterEveningReminderTime;
  const promptReason =
    durationMinutes >= CHECKOUT_REMINDER_MINUTES
      ? '8h'
      : afterEveningReminderTime
        ? '1730'
        : 'none';

  return {
    promptKey: shouldPrompt ? `checkout:${controller.today.workDate}:${promptReason}` : null,
    shouldPrompt,
  };
}

function resolveAttendanceActionKind(
  controller: ReturnType<typeof useOwnCheckInController>,
  override: AttendanceActionKind | null,
): AttendanceActionKind {
  if (override) {
    return override;
  }

  return controller.today?.status === 'CHECKED_IN' ? 'checkout' : 'checkin';
}

interface ChannelSidebarProps {
  mode: WorkspaceMode;
  categoryName: string;
  serverOptions: Array<{ id: string; name: string }>;
  groups: GroupResponse[];
  archivedGroups: GroupResponse[];
  selectedSpecialPageId?: string;
  subscriptionUnreadCount?: number;
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
  onChangeCategory: (groupId: string, serverId: string) => void;
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
  categoryName,
  serverOptions,
  groups,
  archivedGroups,
  selectedSpecialPageId = '',
  subscriptionUnreadCount = 0,
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
  onChangeCategory,
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
  const resolvedAccessToken = useResolvedAccessToken(accessToken);
  const progressTimerRef = useRef<number | null>(null);
  const successTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);
  const attendanceActionStartedAtRef = useRef<number | null>(null);
  const [attendanceActionPhase, setAttendanceActionPhase] = useState<
    'idle' | 'running' | 'success'
  >('idle');
  const [attendanceActionProgress, setAttendanceActionProgress] = useState(0);
  const attendanceController = useOwnCheckInController(resolvedAccessToken, {
    onError: () => {
      attendanceActionStartedAtRef.current = null;
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      setAttendanceActionPhase('idle');
      setAttendanceActionProgress(0);
    },
    onSuccess: () => {
      const startedAt = attendanceActionStartedAtRef.current ?? Date.now();
      const elapsedMs = Date.now() - startedAt;
      const remainingProgressMs = Math.max(0, ATTENDANCE_ACTION_MIN_PROGRESS_MS - elapsedMs);

      successTimerRef.current = window.setTimeout(() => {
        if (progressTimerRef.current !== null) {
          window.clearInterval(progressTimerRef.current);
          progressTimerRef.current = null;
        }
        setAttendanceActionProgress(100);
        setAttendanceActionPhase('success');
        attendanceActionStartedAtRef.current = null;
        successTimerRef.current = window.setTimeout(() => {
          setIsAttendancePanelOpen(false);
          successTimerRef.current = null;
          resetTimerRef.current = window.setTimeout(() => {
            setAttendanceActionPhase('idle');
            setAttendanceActionProgress(0);
            setAttendancePanelKindOverride(null);
            resetTimerRef.current = null;
          }, ATTENDANCE_PANEL_EXIT_MS);
        }, ATTENDANCE_ACTION_SUCCESS_MS);
      }, remainingProgressMs);
    },
  });
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [menuState, setMenuState] = useState<{ group: GroupResponse; x: number; y: number } | null>(
    null,
  );
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [discoverableExpanded, setDiscoverableExpanded] = useState(false);
  const [isAttendancePanelOpen, setIsAttendancePanelOpen] = useState(false);
  const [isAttendancePanelMounted, setIsAttendancePanelMounted] = useState(false);
  const [attendancePanelVisualState, setAttendancePanelVisualState] = useState<'open' | 'closed'>(
    'closed',
  );
  const [attendancePanelKindOverride, setAttendancePanelKindOverride] =
    useState<AttendanceActionKind | null>(null);
  const [dismissedAttendancePromptKey, setDismissedAttendancePromptKey] = useState<string | null>(
    null,
  );
  const [pendingAttendancePromptKey, setPendingAttendancePromptKey] = useState<string | null>(null);
  const lastAttendanceReminderNonceRef = useRef(0);
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

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (attendanceActionPhase !== 'running') {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      return;
    }

    setAttendanceActionProgress(0);
    attendanceActionStartedAtRef.current = Date.now();
    progressTimerRef.current = window.setInterval(() => {
      const startedAt = attendanceActionStartedAtRef.current ?? Date.now();
      const elapsedMs = Date.now() - startedAt;
      const ratio = Math.min(elapsedMs / ATTENDANCE_ACTION_MIN_PROGRESS_MS, 1);
      const nextProgress = Math.min(94, Math.floor(ratio * 94));
      setAttendanceActionProgress(nextProgress);
    }, 55);

    return () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
    };
  }, [attendanceActionPhase]);

  useEffect(
    () => () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current);
      }
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  const attendancePanelState = useMemo(
    () => resolveAttendancePanelState(attendanceController, new Date(nowMs)),
    [
      attendanceController.today,
      attendanceController.todayQuery.isLoading,
      attendanceController.todayQuery.isError,
      attendanceController.todayQuery.dataUpdatedAt,
      nowMs,
    ],
  );
  const attendanceActionKind = useMemo(
    () => resolveAttendanceActionKind(attendanceController, attendancePanelKindOverride),
    [attendanceController.today?.status, attendancePanelKindOverride],
  );

  useEffect(() => {
    if (!attendancePanelState.promptKey) {
      setPendingAttendancePromptKey(null);
      return;
    }
    if (dismissedAttendancePromptKey === attendancePanelState.promptKey) {
      setPendingAttendancePromptKey(null);
      return;
    }
    setAttendancePanelKindOverride(null);
    setPendingAttendancePromptKey(attendancePanelState.promptKey);
    const timer = window.setTimeout(() => {
      setIsAttendancePanelOpen(true);
      setPendingAttendancePromptKey(null);
    }, ATTENDANCE_PANEL_AUTO_OPEN_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [attendancePanelState.promptKey, dismissedAttendancePromptKey]);

  useEffect(() => {
    if (!attendanceReminderRequest) {
      return;
    }

    if (attendanceReminderRequest.nonce === lastAttendanceReminderNonceRef.current) {
      return;
    }

    lastAttendanceReminderNonceRef.current = attendanceReminderRequest.nonce;
    setDismissedAttendancePromptKey(null);
    setAttendancePanelKindOverride(attendanceReminderRequest.kind);
    setPendingAttendancePromptKey(
      `manual:${attendanceReminderRequest.kind}:${attendanceReminderRequest.nonce}`,
    );
    const timer = window.setTimeout(() => {
      setIsAttendancePanelOpen(true);
      setPendingAttendancePromptKey(null);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [attendanceReminderRequest]);

  useEffect(() => {
    if (isAttendancePanelOpen) {
      setIsAttendancePanelMounted(true);
      setAttendancePanelVisualState('closed');
      const frame = window.requestAnimationFrame(() => {
        setAttendancePanelVisualState('open');
      });
      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    setAttendancePanelVisualState('closed');
    if (!isAttendancePanelMounted) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsAttendancePanelMounted(false);
    }, ATTENDANCE_PANEL_EXIT_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isAttendancePanelMounted, isAttendancePanelOpen]);

  useEffect(() => {
    if (attendanceController.isMutating) {
      return;
    }
    if (attendanceActionPhase !== 'idle') {
      return;
    }
    if (attendancePanelState.promptKey === null) {
      setIsAttendancePanelOpen(false);
      setDismissedAttendancePromptKey(null);
      setPendingAttendancePromptKey(null);
    }
  }, [attendanceActionPhase, attendanceController.isMutating, attendancePanelState.promptKey]);

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
        label: '打开频道设置',
        onSelect: () => onOpenChannelSettings(menuState.group.id),
      },
    ];

    if (canManageCategory) {
      actions.push({
        key: 'adjust-category' as const,
        label: '所属分类调整',
        separatorBefore: true,
        onSelect: () => {},
        subItems: serverOptions.map((server) => ({
          key: `set-server-${server.id}`,
          label: server.name,
          disabled: server.id === menuState.group.serverId,
          hint: server.id === menuState.group.serverId ? '当前' : undefined,
          onSelect: () => onChangeCategory(menuState.group.id, server.id),
        })),
      });
    }

    if (canManageStatus) {
      actions.push({
        key: 'adjust-status' as const,
        label: '调整工作状态',
        hint: currentStatus,
        separatorBefore: true,
        onSelect: () => {},
        subItems: statusNames.map((status) => ({
          key: `set-status-${status}`,
          label: status,
          disabled: status === currentStatus,
          hint: status === currentStatus ? '当前' : undefined,
          onSelect: () => onSetWorkStatus(menuState.group.id, status),
        })),
      });
    }

    if (canArchive) {
      actions.push({
        key: 'archive-group' as const,
        label: isArchived ? '取消归档' : '归档频道',
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
    onChangeCategory,
    onRequestArchiveGroup,
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
    if (!msg?.text) return formatRelativeTime(group.updatedAt);
    const prefix = msg.senderId === currentUser.id ? '你: ' : '';
    const text = msg.text.length > 42 ? msg.text.slice(0, 42) + '...' : msg.text;
    return prefix + text;
  }

  return (
    <aside
      className={`${styles.sidebar} ${isMobileSidebarOpen ? styles.sidebarVisible : ''}`}
      data-testid="groups-sidebar"
    >
      <div className={styles.header}>
        <span className={styles.headerTitle} title={categoryName}>
          {isDMMode ? '收件箱' : categoryName}
        </span>
        <div className={styles.headerActions}>
          {isDMMode && onStartNewDM ? (
            <button
              className={styles.headerAddButton}
              type="button"
              onClick={onStartNewDM}
              title="新建私聊"
              aria-label="新建私聊"
            >
              +
            </button>
          ) : null}
          {!isDMMode && onCreateNewChannel && canCreateChannel ? (
            <button
              className={styles.headerAddButton}
              type="button"
              onClick={onCreateNewChannel}
              title="新建频道"
              aria-label="新建频道"
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
            关闭
          </button>
        </div>
      </div>
      <div className={styles.section}>
        {isDMMode ? (
          <div className={styles.specialSection}>
            <div className={styles.sectionTitle}>功能</div>
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
                    <span>{page.label}</span>
                  </strong>
                  {page.id === DM_SUBSCRIPTION_PAGE_ID && subscriptionUnreadCount > 0 ? (
                    <span className={styles.unreadBadge}>
                      {subscriptionUnreadCount > 99 ? '99+' : subscriptionUnreadCount}
                    </span>
                  ) : null}
                  {page.id === DM_ALBUM_PAGE_ID && albumHasUpdates ? (
                    <span className={styles.updateDot} aria-label="相册有新内容" />
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        ) : null}
        <div className={styles.sectionTitle}>{isDMMode ? '会话列表' : '频道列表'}</div>
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
                      aria-label="关闭私聊"
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
                        <span className={styles.confirmedMarker} title="已打包">
                          已打包
                        </span>
                      ) : null}
                      <span>{group.memberCount ?? group.members.length} 人</span>
                      <span className={styles.groupMetaTime}>
                        {formatRelativeTime(group.updatedAt)}
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
              已归档 ({sortedArchivedGroups.length})
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
                          <span className={styles.confirmedMarker} title="已打包">
                            已打包
                          </span>
                        ) : null}
                        <span>{group.memberCount ?? group.members.length} 人</span>
                        <span className={styles.groupMetaTime}>
                          {formatRelativeTime(group.updatedAt)}
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
              未加入 ({discoverableGroups.length})
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
                      title={`${group.name} · ${group.memberCount ?? 0} 人`}
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
                        <span>{group.memberCount ?? 0} 人</span>
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
        isAttendancePanelMounted={isAttendancePanelMounted}
        attendancePanelVisualState={attendancePanelVisualState}
        attendanceActionPhase={attendanceActionPhase}
        attendanceActionProgress={attendanceActionProgress}
        attendanceActionKind={attendanceActionKind}
        attendanceActionDisabled={attendanceController.actionDisabled}
        onCloseAttendancePanel={() => {
          setIsAttendancePanelOpen(false);
          setPendingAttendancePromptKey(null);
          setAttendancePanelKindOverride(null);
          if (attendancePanelState.promptKey) {
            setDismissedAttendancePromptKey(attendancePanelState.promptKey);
          }
        }}
        onPerformAttendanceAction={() => {
          if (attendanceActionPhase !== 'idle') return;
          setAttendanceActionPhase('running');
          setPendingAttendancePromptKey(null);
          attendanceController.performPrimaryAction();
        }}
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
