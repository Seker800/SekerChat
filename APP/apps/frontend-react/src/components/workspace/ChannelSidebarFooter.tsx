import { Link } from 'react-router-dom';
import type { CurrentUserResponse } from '../../lib/auth-api';
import { Avatar } from '../shared/Avatar';
import styles from './ChannelSidebar.module.css';

type AttendanceActionKind = 'checkin' | 'checkout';
type AttendanceActionPhase = 'idle' | 'running' | 'success';

type ChannelSidebarFooterProps = {
  accessToken: string;
  currentUser: CurrentUserResponse;
  isDnd: boolean;
  canAccessAdmin: boolean;
  isAttendancePanelMounted: boolean;
  attendancePanelVisualState: 'open' | 'closed';
  attendanceActionPhase: AttendanceActionPhase;
  attendanceActionProgress: number;
  attendanceActionKind: AttendanceActionKind;
  attendanceActionDisabled: boolean;
  onCloseAttendancePanel: () => void;
  onPerformAttendanceAction: () => void;
  onChangeUserAvatar: () => void;
  onOpenDisplayNameSettings: () => void;
  onToggleDnd: () => void;
};

export function ChannelSidebarFooter({
  accessToken,
  currentUser,
  isDnd,
  canAccessAdmin,
  isAttendancePanelMounted,
  attendancePanelVisualState,
  attendanceActionPhase,
  attendanceActionProgress,
  attendanceActionKind,
  attendanceActionDisabled,
  onCloseAttendancePanel,
  onPerformAttendanceAction,
  onChangeUserAvatar,
  onOpenDisplayNameSettings,
  onToggleDnd,
}: ChannelSidebarFooterProps) {
  return (
    <div className={styles.userPanel}>
      {isAttendancePanelMounted ? (
        <div
          className={styles.attendanceCard}
          data-testid="attendance-popover"
          data-state={attendancePanelVisualState}
        >
          <div className={styles.attendanceCardHeader}>
            <span className={styles.attendanceCardLabel}>提醒</span>
            <button
              type="button"
              className={styles.attendanceCardClose}
              onClick={onCloseAttendancePanel}
              aria-label="关闭工作状态面板"
            >
              ×
            </button>
          </div>
          <button
            type="button"
            className={`${styles.attendanceCardAction} ${
              attendanceActionPhase === 'running' ? styles.attendanceCardActionRunning : ''
            } ${attendanceActionPhase === 'success' ? styles.attendanceCardActionSuccess : ''}`}
            aria-label="提醒动作"
            onClick={onPerformAttendanceAction}
            disabled={attendanceActionDisabled || attendanceActionPhase !== 'idle'}
          >
            <span
              className={styles.attendanceCardActionFill}
              style={{
                width: `${attendanceActionPhase === 'idle' ? 0 : attendanceActionProgress}%`,
              }}
            />
            <span className={styles.attendanceCardActionLabel}>
              {attendanceActionPhase === 'running'
                ? `${Math.round(attendanceActionProgress)}%`
                : attendanceActionPhase === 'success'
                  ? attendanceActionKind === 'checkout'
                    ? '签退成功'
                    : '签到成功'
                  : attendanceActionKind === 'checkout'
                    ? '签退'
                    : '签到'}
            </span>
          </button>
        </div>
      ) : null}
      <div className={styles.userPanelMainRow}>
        <button
          className={styles.userPanelAccount}
          type="button"
          onClick={onChangeUserAvatar}
          data-tooltip="点击修改头像"
          aria-label="修改头像"
        >
          <Avatar
            avatarUrl={currentUser.avatarUrl}
            name={currentUser.displayName || currentUser.email}
            size={32}
            accessToken={accessToken}
            isOnline
            isDnd={isDnd}
          />
          <span className={styles.tooltipBubble}>点击修改头像</span>
        </button>
        <button
          className={styles.userPanelInfo}
          type="button"
          onClick={onOpenDisplayNameSettings}
          data-tooltip="点击修改昵称 / ID"
          aria-label="打开个人设置，修改昵称 / ID"
        >
          <span className={styles.userPanelName}>
            {currentUser.displayName || currentUser.email}
          </span>
          <span className={styles.userPanelEmail}>{currentUser.email}</span>
          <span className={styles.tooltipBubble}>点击修改昵称 / ID</span>
        </button>
        {canAccessAdmin ? (
          <Link to="/admin" className={styles.userPanelGear} title="管理" aria-label="管理">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </Link>
        ) : null}
        <button
          className={`${styles.userPanelGear} ${isDnd ? styles.userPanelGearActive : ''}`}
          onClick={onToggleDnd}
          title={isDnd ? '开启通知' : '关闭通知'}
          aria-label={isDnd ? '开启通知' : '关闭通知'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={isDnd ? '#eab308' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
