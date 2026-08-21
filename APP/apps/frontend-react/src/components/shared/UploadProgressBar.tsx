import styles from './UploadProgressBar.module.css';

export interface UploadProgressBarProps {
  fileName: string;
  percent: number;
  speedBytesPerSec: number;
  error?: string;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function UploadProgressBar({ fileName, percent, speedBytesPerSec, error }: UploadProgressBarProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.fileName}>{fileName}</span>
        {error ? (
          <span className={styles.error}>{error}</span>
        ) : (
          <span className={styles.percent}>{percent}%</span>
        )}
      </div>
      <div className={styles.track}>
        <div
          className={`${styles.bar} ${error ? styles.barError : ''}`}
          style={{ width: `${error ? 100 : percent}%` }}
        />
      </div>
      {!error ? (
        <div className={styles.speed}>{formatSpeed(speedBytesPerSec)}</div>
      ) : null}
    </div>
  );
}
