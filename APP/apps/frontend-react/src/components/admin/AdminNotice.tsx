import { useEffect, useRef } from 'react';
import styles from './AdminPage.module.css';

export interface AdminNoticeState {
  type: 'success' | 'error';
  message: string;
}

interface AdminNoticeProps {
  notice: AdminNoticeState | null;
  onDismiss: () => void;
}

const SUCCESS_DISMISS_MS = 4000;

export function AdminNotice({ notice, onDismiss }: AdminNoticeProps) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!notice || notice.type !== 'success') return;
    const timer = window.setTimeout(() => dismissRef.current(), SUCCESS_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  if (!notice) return null;

  return (
    <div
      className={`${styles.adminToast} ${notice.type === 'success' ? styles.adminToastSuccess : styles.adminToastError}`}
      role={notice.type === 'error' ? 'alert' : 'status'}
    >
      <span className={styles.adminToastMessage}>{notice.message}</span>
      <button
        className={styles.adminToastClose}
        type="button"
        aria-label="关闭提示"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
