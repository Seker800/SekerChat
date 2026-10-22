import styles from './RetryNotice.module.css';

interface RetryNoticeProps {
  message: string;
  retryLabel: string;
  onRetry?: () => void;
}

export function RetryNotice({ message, retryLabel, onRetry }: RetryNoticeProps) {
  return <div className={styles.notice} role="alert">
    <p>{message}</p>
    {onRetry ? <button type="button" onClick={onRetry}>{retryLabel}</button> : null}
  </div>;
}
