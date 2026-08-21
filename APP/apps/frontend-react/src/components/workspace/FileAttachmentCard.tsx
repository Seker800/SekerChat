import { IconDownload, IconShare3 } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { FileIcon } from './FileIcon';
import styles from './MessagePane.module.css';

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type FileAttachmentCardProps = {
  filename: string;
  size: number;
  canShare?: boolean;
  isSharing?: boolean;
  compact?: boolean;
  onShare: () => void;
  onDownload: () => void;
  accessory?: ReactNode;
};

export function FileAttachmentCard({
  filename,
  size,
  canShare = true,
  isSharing = false,
  compact = false,
  onShare,
  onDownload,
  accessory,
}: FileAttachmentCardProps) {
  return (
    <div
      className={`${styles.attachment} ${styles.attachmentCard} ${compact ? styles.attachmentCompact : ''}`}
      data-testid="file-attachment-card"
    >
      <div className={styles.attachmentSummary}>
        <div className={styles.attachmentGlyph}>
          <FileIcon filename={filename} />
        </div>
        <div className={styles.attachmentMeta}>
          <strong>{filename}</strong>
          <span>{formatFileSize(size)}</span>
        </div>
      </div>
      <div className={styles.attachmentActionCluster}>
        <div
          className={`${styles.attachmentActions} ${canShare ? '' : styles.attachmentActionsDownloadOnly}`}
          role="group"
          aria-label="文件操作"
          data-layout="compact"
        >
          {canShare ? (
            <button
              className={`${styles.attachmentAction} ${isSharing ? styles.attachmentActionSharing : ''}`}
              type="button"
              aria-label={`${isSharing ? '管理分享' : '分享'} ${filename}`}
              data-sharing={isSharing ? 'true' : undefined}
              onClick={onShare}
            >
              <IconShare3 size={13} stroke={1.7} aria-hidden="true" />
              {isSharing ? '分享ing' : '分享'}
            </button>
          ) : null}
          <button
            className={styles.attachmentAction}
            type="button"
            aria-label={`下载 ${filename}`}
            onClick={onDownload}
          >
            <IconDownload size={13} stroke={1.7} aria-hidden="true" />
            下载
          </button>
        </div>
        {accessory}
      </div>
    </div>
  );
}
