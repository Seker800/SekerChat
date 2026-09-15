import { Link } from 'react-router-dom';
import type { CurrentUserResponse } from '../../lib/auth-api';
import { Avatar } from '../shared/Avatar';
import styles from './ChannelSidebar.module.css';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  return (
    <div className={styles.userPanel}>
      {isAttendancePanelMounted ? (
        <div
          className={styles.attendanceCard}
          data-testid="attendance-popover"
          data-state={attendancePanelVisualState}
        >
          <div className={styles.attendanceCardHeader}>
            <span className={styles.attendanceCardLabel}>{t('sidebarFooter.reminder')}</span>
            <button
              type="button"
              className={styles.attendanceCardClose}
              onClick={onCloseAttendancePanel}
              aria-label={t('sidebarFooter.closeAttendance')}
            >
              ×
            </button>
          </div>
          <button
            type="button"
            className={`${styles.attendanceCardAction} ${
              attendanceActionPhase === 'running' ? styles.attendanceCardActionRunning : ''
            } ${attendanceActionPhase === 'success' ? styles.attendanceCardActionSuccess : ''}`}
            aria-label={t('sidebarFooter.attendanceAction')}
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
                    ? t('sidebarFooter.checkOutSuccess')
                    : t('sidebarFooter.checkInSuccess')
                  : attendanceActionKind === 'checkout'
                    ? t('sidebarFooter.checkOut')
                    : t('sidebarFooter.checkIn')}
            </span>
          </button>
        </div>
      ) : null}
      <div className={styles.userPanelMainRow}>
        <button
          className={styles.userPanelAccount}
          type="button"
          onClick={onChangeUserAvatar}
          data-tooltip={t('account.clickToChangeAvatar')}
          aria-label={t('account.changeAvatar')}
        >
          <Avatar
            avatarUrl={currentUser.avatarUrl}
            name={currentUser.displayName || currentUser.email}
            size={32}
            accessToken={accessToken}
            isOnline
            isDnd={isDnd}
          />
          <span className={styles.tooltipBubble}>{t('account.clickToChangeAvatar')}</span>
        </button>
        <button
          className={styles.userPanelInfo}
          type="button"
          onClick={onOpenDisplayNameSettings}
          data-tooltip={t('account.changeDisplayName')}
          aria-label={t('sidebarFooter.openSettings')}
        >
          <span className={styles.userPanelName}>
            {currentUser.displayName || currentUser.email}
          </span>
          <span className={styles.userPanelEmail}>{currentUser.email}</span>
          <span className={styles.tooltipBubble}>{t('account.changeDisplayName')}</span>
        </button>
        {canAccessAdmin ? (
          <Link to="/admin" className={styles.userPanelGear} title={t('sidebarFooter.admin')} aria-label={t('sidebarFooter.admin')}>
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
          title={isDnd ? t('sidebarFooter.enableNotifications') : t('sidebarFooter.disableNotifications')}
          aria-label={isDnd ? t('sidebarFooter.enableNotifications') : t('sidebarFooter.disableNotifications')}
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
