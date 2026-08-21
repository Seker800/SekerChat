import { Fragment, type RefCallback } from 'react';
import type { MessageResponse } from '../../lib/messages-files-api';
import type { PendingUpload } from './useComposer';
import { UploadProgressBar } from '../shared/UploadProgressBar';
import { MessageItem } from './MessageItem';
import { formatDayDivider, isCompactWithPrevious, isSameCalendarDay } from './messagePaneUtils';
import styles from './MessagePane.module.css';
import type { PreviewImage } from '../media/image-preview/useImagePreviewState';
import type { MessageArtifactAction } from './messageArtifactAction';

interface MessageListProps {
  accessToken?: string;
  activeReceiptMessageId: string | null;
  currentUserId: string;
  currentUserMentionTargets?: string[];
  canManageFileShare?: (attachment: NonNullable<MessageResponse['attachment']>) => boolean;
  artifactAction?: MessageArtifactAction;
  editText: string;
  editingMessageId: string | null;
  hasMoreOlderMessages?: boolean;
  isLoadingMessages?: boolean;
  loadError?: string | null;
  isLoadingOlderMessages?: boolean;
  messages: MessageResponse[];
  pendingUploads?: PendingUpload[];
  registerMessageRef: (messageId: string) => RefCallback<HTMLElement>;
  registerReceiptContainerRef: (messageId: string) => RefCallback<HTMLDivElement>;
  onClearPendingError?: (localId: string) => void;
  onContextMenu: (item: MessageResponse, position: { x: number; y: number }) => void;
  onEditMessage?: (messageId: string, text: string) => void;
  onPreviewImage: (image: PreviewImage) => void;
  onJumpToMessage?: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onRetryPendingUpload?: (localId: string) => void;
  onRetryPendingMessage?: (localId: string) => void;
  onMessageContentResized: () => void;
  onSetActiveReceiptMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  onSetEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  onSetEditText: React.Dispatch<React.SetStateAction<string>>;
}

function LoadingMessageSkeletons() {
  return (
    <div className={styles.skeletonList} aria-hidden="true">
      <article
        className={`${styles.message} ${styles.messageRegular} ${styles.messageSkeleton}`}
        data-testid="message-skeleton-row"
      >
        <div className={styles.avatarColumn}>
          <div className={styles.skeletonAvatar} />
        </div>
        <div className={styles.body}>
          <div className={styles.skeletonMeta}>
            <div className={`${styles.skeletonBlock} ${styles.skeletonSender}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonTime}`} />
          </div>
          <div className={`${styles.skeletonBlock} ${styles.skeletonLineWide}`} />
          <div className={`${styles.skeletonBlock} ${styles.skeletonLineMedium}`} />
        </div>
      </article>
      <article
        className={`${styles.message} ${styles.messageCompact} ${styles.messageSkeleton}`}
        data-testid="message-skeleton-row"
      >
        <div className={styles.avatarColumn} />
        <div className={styles.body}>
          <div className={`${styles.skeletonBlock} ${styles.skeletonLineMedium}`} />
        </div>
      </article>
      <article
        className={`${styles.message} ${styles.messageRegular} ${styles.messageFileAttachment} ${styles.messageSkeleton}`}
        data-testid="message-skeleton-row"
      >
        <div className={styles.avatarColumn}>
          <div className={styles.skeletonAvatar} />
        </div>
        <div className={styles.body}>
          <div className={styles.skeletonMeta}>
            <div className={`${styles.skeletonBlock} ${styles.skeletonSender}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonTime}`} />
          </div>
          <div className={styles.skeletonAttachment} />
        </div>
      </article>
      <article
        className={`${styles.message} ${styles.messageRegular} ${styles.messageImageAttachment} ${styles.messageSkeleton}`}
        data-testid="message-skeleton-row"
      >
        <div className={styles.avatarColumn}>
          <div className={styles.skeletonAvatar} />
        </div>
        <div className={styles.body}>
          <div className={styles.skeletonMeta}>
            <div className={`${styles.skeletonBlock} ${styles.skeletonSender}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonTime}`} />
          </div>
          <div className={styles.skeletonImage} />
        </div>
      </article>
      <article
        className={`${styles.message} ${styles.messageCompact} ${styles.messageSkeleton}`}
        data-testid="message-skeleton-row"
      >
        <div className={styles.avatarColumn} />
        <div className={styles.body}>
          <div className={`${styles.skeletonBlock} ${styles.skeletonLineShort}`} />
        </div>
      </article>
    </div>
  );
}

export function MessageList({
  accessToken,
  activeReceiptMessageId,
  currentUserId,
  currentUserMentionTargets,
  canManageFileShare,
  artifactAction,
  editText,
  editingMessageId,
  hasMoreOlderMessages,
  isLoadingMessages,
  loadError,
  isLoadingOlderMessages,
  messages,
  pendingUploads,
  registerMessageRef,
  registerReceiptContainerRef,
  onClearPendingError,
  onContextMenu,
  onEditMessage,
  onJumpToMessage,
  onPreviewImage,
  onReply,
  onRetryPendingUpload,
  onRetryPendingMessage,
  onMessageContentResized,
  onSetActiveReceiptMessageId,
  onSetEditingMessageId,
  onSetEditText,
}: MessageListProps) {
  return (
    <>
      {hasMoreOlderMessages || isLoadingOlderMessages ? (
        <div className={styles.dayDivider} style={{ marginTop: 0, marginBottom: 12 }}>
          <span>{isLoadingOlderMessages ? '加载更早消息中…' : '向上滚动加载更早消息'}</span>
        </div>
      ) : null}
      {isLoadingMessages ? <LoadingMessageSkeletons /> : null}
      {!isLoadingMessages && loadError ? <div className={styles.empty}>{loadError}</div> : null}
      {!isLoadingMessages && !loadError && !messages.length ? (
        <div className={styles.empty}>当前会话还没有消息。</div>
      ) : null}
      {messages.map((item, index) => {
        const previous = messages[index - 1];
        const isCompact = isCompactWithPrevious(previous, item);
        const showDivider = !isSameCalendarDay(previous, item);

        return (
          <Fragment key={item.clientKey ?? item.id}>
            {showDivider ? (
              <div className={styles.dayDivider}>
                <span>{formatDayDivider(item.createdAt)}</span>
              </div>
            ) : null}
            <MessageItem
              accessToken={accessToken}
              activeReceiptMessageId={activeReceiptMessageId}
              currentUserId={currentUserId}
              currentUserMentionTargets={currentUserMentionTargets}
              canManageFileShare={canManageFileShare}
              artifactAction={artifactAction}
              editText={editText}
              editingMessageId={editingMessageId}
              isCompact={isCompact}
              item={item}
              messageRef={registerMessageRef(item.id)}
              receiptContainerRef={registerReceiptContainerRef(item.id)}
              onClearPendingError={onClearPendingError}
              onContextMenu={onContextMenu}
              onEditMessage={onEditMessage}
              onPreviewImage={onPreviewImage}
              onJumpToMessage={onJumpToMessage}
              onReply={onReply}
              onRetryPendingMessage={onRetryPendingMessage}
              onMessageContentResized={onMessageContentResized}
              onSetActiveReceiptMessageId={onSetActiveReceiptMessageId}
              onSetEditingMessageId={onSetEditingMessageId}
              onSetEditText={onSetEditText}
            />
          </Fragment>
        );
      })}
      {pendingUploads && pendingUploads.length > 0 ? (
        <div className={styles.pendingUploads}>
          {pendingUploads.map((pendingUpload) => (
            <article
              key={pendingUpload.localId}
              className={`${styles.message} ${styles.messageMine}`}
            >
              <div className={styles.pendingFile}>
                <div className={styles.pendingFileIcon}>
                  {pendingUpload.fileName.match(/\.(png|jpe?g|gif|webp|svg|bmp)$/i) ? '🖼' : '📎'}
                </div>
                <div className={styles.pendingFileContent}>
                  <span className={styles.pendingFileName}>{pendingUpload.fileName}</span>
                  <UploadProgressBar
                    fileName={pendingUpload.fileName}
                    percent={pendingUpload.progress.percent}
                    speedBytesPerSec={pendingUpload.progress.speedBytesPerSec}
                    error={pendingUpload.error}
                  />
                  {pendingUpload.status === 'error' ? (
                    <div className={styles.pendingActions}>
                      <button
                        className={styles.pendingDismiss}
                        type="button"
                        onClick={() => onRetryPendingUpload?.(pendingUpload.localId)}
                      >
                        重发
                      </button>
                      <button
                        className={styles.pendingDismiss}
                        type="button"
                        onClick={() => onClearPendingError?.(pendingUpload.localId)}
                      >
                        关闭
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </>
  );
}
