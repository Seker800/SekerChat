import type { MultipartUploadProgress } from '../../lib/multipart-upload';
import styles from './UploadProgressBar.module.css';

export interface UploadProgressBarProps {
  fileName: string;
  percent: number;
  speedBytesPerSec: number;
  error?: string;
  progress?: MultipartUploadProgress;
  creatingMessage?: boolean;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
  if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function UploadProgressBar({
  fileName,
  percent,
  speedBytesPerSec,
  error,
  progress,
  creatingMessage,
}: UploadProgressBarProps) {
  const stageText = creatingMessage
    ? '正在发送消息'
    : progress?.stage === 'retrying'
      ? `网络重试第 ${progress.retryAttempt} 次`
      : progress?.stage === 'finalizing'
        ? '正在完成上传'
        : percent === 100
          ? '等待服务器确认'
          : '正在上传';
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
      <div
        className={styles.track}
        role="progressbar"
        aria-label={`${fileName} 上传进度`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div
          className={`${styles.bar} ${error ? styles.barError : ''}`}
          style={{ width: `${error ? 100 : percent}%` }}
        />
      </div>
      {!error ? (
        <div className={styles.speed}>
          {formatSpeed(speedBytesPerSec)} · {stageText}
          {progress?.totalParts !== undefined
            ? ` · 已确认 ${progress.completedParts}/${progress.totalParts}`
            : ''}
          {progress?.elapsedSeconds !== undefined ? ` · 已用时 ${progress.elapsedSeconds} 秒` : ''}
        </div>
      ) : null}
    </div>
  );
}
