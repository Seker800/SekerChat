import { useVirtualizer } from '@tanstack/react-virtual';
import { RetryNotice } from '../shared/RetryNotice';
import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type RefCallback,
  type RefObject,
} from 'react';
import type { MessageResponse } from '../../lib/messages-files-api';
import type { PendingUpload } from './useComposer';
import { UploadProgressBar } from '../shared/UploadProgressBar';
import { MessageItem } from './MessageItem';
import {
  formatDayDivider,
  isCompactWithPrevious,
  isSameCalendarDay,
  messageDisplayTime,
} from './messagePaneUtils';
import styles from './MessagePane.module.css';
import type { PreviewImage } from '../media/image-preview/useImagePreviewState';
import type { MessageArtifactAction } from './messageArtifactAction';
import { useTranslation } from 'react-i18next';
import type { VisibleMessageAnchor } from './messageViewportCoordinator';

export interface MessageListNavigation {
  jumpToMessage: (messageId: string) => boolean;
  restoreAnchor: (anchor: VisibleMessageAnchor) => boolean;
  captureAnchor: () => VisibleMessageAnchor | null;
}

interface MessageListProps {
  streamRef: RefObject<HTMLElement | null>;
  navigationRef: RefObject<MessageListNavigation | null>;
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
  onRetryLoad?: () => void;
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
  streamRef,
  navigationRef,
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
  onRetryLoad,
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
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage === 'en' ? 'en' : 'zh-CN';
  const virtualized = messages.length > 100;
  const rows = useMemo(() => {
    const result: Array<{ key: string; kind: 'history' | 'day' | 'message'; index: number }> = [
      { key: 'history', kind: 'history', index: -1 },
    ];
    messages.forEach((message, index) => {
      const key = message.clientKey ?? message.id;
      if (!isSameCalendarDay(messages[index - 1], message, language)) {
        result.push({ key: `day:${key}`, kind: 'day', index });
      }
      result.push({ key, kind: 'message', index });
    });
    return result;
  }, [messages, language]);
  const getItemKey = useCallback((index: number) => rows[index]!.key, [rows]);
  const [restoration, setRestoration] = useState<{
    messageId: string | null;
    padding: number;
  } | null>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => streamRef.current,
    getItemKey,
    estimateSize: () => 80,
    overscan: 8,
    scrollPaddingStart: restoration?.padding ?? 0,
    enabled: virtualized,
  });
  const restorationIndex = restoration
    ? rows.findIndex(
        (row) => row.kind === 'message' && messages[row.index]!.id === restoration.messageId,
      )
    : -1;
  useLayoutEffect(() => {
    if (restorationIndex >= 0) virtualizer.scrollToIndex(restorationIndex, { align: 'start' });
  }, [restoration, restorationIndex, virtualizer]);
  const virtualRows = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  useLayoutEffect(() => {
    navigationRef.current = {
      captureAnchor() {
        const root = streamRef.current;
        if (!root || !virtualized) return null;
        const first = virtualizer.getVirtualItemForOffset(root.scrollTop)?.index ?? 0;
        const index = rows.findIndex((row, index) => index >= first && row.kind === 'message');
        if (index < 0) return null;
        const offset = virtualizer.getOffsetForIndex(index, 'start')?.[0];
        if (offset === undefined) return null;
        return {
          messageId: messages[rows[index]!.index]!.id,
          offsetTop: offset + parseFloat(getComputedStyle(root).paddingTop) - root.scrollTop,
          scrollHeight: root.scrollHeight,
          scrollTop: root.scrollTop,
        };
      },
      restoreAnchor(anchor) {
        const root = streamRef.current;
        if (!virtualized || !root || !messages.some((message) => message.id === anchor.messageId))
          return false;
        setRestoration({
          messageId: anchor.messageId,
          padding: anchor.offsetTop - parseFloat(getComputedStyle(root).paddingTop),
        });
        return true;
      },
      jumpToMessage(messageId) {
        const index = rows.findIndex(
          (row) => row.kind === 'message' && messages[row.index]!.id === messageId,
        );
        if (index < 0 || !virtualized) return false;
        virtualizer.scrollToIndex(index, { align: 'center' });
        return true;
      },
    };
    return () => {
      navigationRef.current = null;
    };
  }, [messages, rows, navigationRef, virtualized, virtualizer]);
  useLayoutEffect(() => {
    if (virtualized) onMessageContentResized();
  }, [totalSize, virtualized, onMessageContentResized]);
  const renderRow = (row: (typeof rows)[number]) => {
    if (row.kind === 'history')
      return hasMoreOlderMessages || isLoadingOlderMessages ? (
        <div className={styles.dayDivider} style={{ marginTop: 0, marginBottom: 12 }}>
          <span>
            {isLoadingOlderMessages ? t('messages.loadingOlder') : t('messages.loadOlder')}
          </span>
        </div>
      ) : null;
    const item = messages[row.index]!;
    if (row.kind === 'day')
      return (
        <div className={styles.dayDivider}>
          <span>{formatDayDivider(messageDisplayTime(item), language)}</span>
        </div>
      );
    const isCompact = isCompactWithPrevious(messages[row.index - 1], item);
    return (
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
    );
  };
  return (
    <>
      {isLoadingMessages ? <LoadingMessageSkeletons /> : null}
      {!isLoadingMessages && loadError ? (
        <div className={styles.empty}>
          <RetryNotice message={loadError} retryLabel="重试加载消息" onRetry={onRetryLoad} />
        </div>
      ) : null}
      {!isLoadingMessages && !loadError && !messages.length ? (
        <div className={styles.empty}>{t('messages.empty')}</div>
      ) : null}
      {virtualized ? (
        <div
          style={{
            paddingTop: virtualRows[0]?.start ?? 0,
            paddingBottom: Math.max(0, totalSize - (virtualRows.at(-1)?.end ?? 0)),
          }}
        >
          {virtualRows.map((row) => (
            <div
              key={row.key}
              data-index={row.index}
              ref={virtualizer.measureElement}
              style={{ display: 'flow-root' }}
            >
              {renderRow(rows[row.index]!)}
            </div>
          ))}
        </div>
      ) : (
        rows.map((row) => <Fragment key={row.key}>{renderRow(row)}</Fragment>)
      )}
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
                    progress={pendingUpload.progress}
                    creatingMessage={pendingUpload.status === 'creating-message'}
                  />
                  {pendingUpload.status === 'uploading' ? (
                    <button
                      type="button"
                      className={styles.pendingDismiss}
                      onClick={() => onClearPendingError?.(pendingUpload.localId)}
                    >
                      取消上传
                    </button>
                  ) : null}
                  {pendingUpload.status === 'error' ? (
                    <div className={styles.pendingActions}>
                      <button
                        className={styles.pendingDismiss}
                        type="button"
                        onClick={() => onRetryPendingUpload?.(pendingUpload.localId)}
                      >
                        {t('messages.retrySend')}
                      </button>
                      <button
                        className={styles.pendingDismiss}
                        type="button"
                        onClick={() => onClearPendingError?.(pendingUpload.localId)}
                      >
                        {t('common.close')}
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
