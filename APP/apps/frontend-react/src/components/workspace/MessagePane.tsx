import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import type { MessageResponse } from '../../lib/messages-files-api';
import type { PendingUpload } from './useComposer';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { ImagePreviewDialog } from '../media/image-preview/ImagePreviewDialog';
import { MessageList } from './MessageList';
import { MessageMediaProvider } from './media/MessageMediaProvider';
import { fallbackCopyText } from './messagePaneUtils';
import type { MessageArtifactAction } from './messageArtifactAction';
import styles from './MessagePane.module.css';
import { useImagePreviewState } from '../media/image-preview/useImagePreviewState';
import { useMessageScrollAnchor } from './useMessageScrollAnchor';

interface MessagePaneProps {
  accessToken?: string;
  activeGroupId: string;
  messages: MessageResponse[];
  currentUserId: string;
  currentUserMentionTargets?: string[];
  canManageFileShare?: (attachment: NonNullable<MessageResponse['attachment']>) => boolean;
  artifactAction?: MessageArtifactAction;
  isLoadingMessages?: boolean;
  messageLoadError?: string | null;
  onVisibleLatestMessage?: () => void;
  onLoadOlderMessages?: () => void;
  hasMoreOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  onReply: (messageId: string) => void;
  onUnsupportedAction?: (message: string) => void;
  onCopyMessage?: (message: string) => void;
  onEditMessage?: (messageId: string, text: string) => void;
  onRevokeMessage?: (messageId: string) => void;
  pendingUploads?: PendingUpload[];
  onClearPendingError?: (localId: string) => void;
  onRetryPendingUpload?: (localId: string) => void;
  onRetryPendingMessage?: (localId: string) => void;
}

export function MessagePane({
  accessToken,
  activeGroupId,
  messages,
  currentUserId,
  currentUserMentionTargets,
  canManageFileShare,
  artifactAction,
  isLoadingMessages,
  messageLoadError,
  onVisibleLatestMessage,
  onLoadOlderMessages,
  hasMoreOlderMessages,
  isLoadingOlderMessages,
  onReply,
  onUnsupportedAction,
  onCopyMessage,
  onEditMessage,
  onRevokeMessage,
  pendingUploads,
  onClearPendingError,
  onRetryPendingUpload,
  onRetryPendingMessage,
}: MessagePaneProps) {
  const resolvedAccessToken = useResolvedAccessToken(accessToken);
  const messageRefs = useRef(new Map<string, HTMLElement>());
  const receiptContainerRefs = useRef(new Map<string, HTMLDivElement>());
  const [menuState, setMenuState] = useState<{
    item: MessageResponse;
    x: number;
    y: number;
  } | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [activeReceiptMessageId, setActiveReceiptMessageId] = useState<string | null>(null);
  const { handleContentResized, handleScroll, streamRef } = useMessageScrollAnchor({
    activeGroupId,
    currentUserId,
    hasMoreOlderMessages,
    isLoadingOlderMessages,
    messages,
    onLoadOlderMessages,
    onVisibleLatestMessage,
  });
  const imagePreview = useImagePreviewState();
  const handleCloseMenu = useCallback(() => {
    setMenuState(null);
  }, []);

  useEffect(() => {
    if (!editingMessageId) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditingMessageId(null);
        setEditText('');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingMessageId]);

  useEffect(() => {
    if (!activeReceiptMessageId) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveReceiptMessageId(null);
      }
    };

    const handlePointerDown = (event: MouseEvent) => {
      const container = receiptContainerRefs.current.get(activeReceiptMessageId);
      if (!container) {
        setActiveReceiptMessageId(null);
        return;
      }

      if (!container.contains(event.target as Node)) {
        setActiveReceiptMessageId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [activeReceiptMessageId]);

  const refCallbackCacheRef = useRef(new Map<string, RefCallback<HTMLElement>>());
  const receiptRefCallbackCacheRef = useRef(new Map<string, RefCallback<HTMLDivElement>>());

  const registerMessageRef = useCallback((messageId: string): RefCallback<HTMLElement> => {
    const cached = refCallbackCacheRef.current.get(messageId);
    if (cached) return cached;
    const callback: RefCallback<HTMLElement> = (node) => {
      if (node) {
        messageRefs.current.set(messageId, node);
        return;
      }
      messageRefs.current.delete(messageId);
      refCallbackCacheRef.current.delete(messageId);
    };
    refCallbackCacheRef.current.set(messageId, callback);
    return callback;
  }, []);

  const registerReceiptContainerRef = useCallback(
    (messageId: string): RefCallback<HTMLDivElement> => {
      const cached = receiptRefCallbackCacheRef.current.get(messageId);
      if (cached) return cached;
      const callback: RefCallback<HTMLDivElement> = (node) => {
        if (node) {
          receiptContainerRefs.current.set(messageId, node);
          return;
        }
        receiptContainerRefs.current.delete(messageId);
        receiptRefCallbackCacheRef.current.delete(messageId);
      };
      receiptRefCallbackCacheRef.current.set(messageId, callback);
      return callback;
    },
    [],
  );

  // Clean up stale callback caches when the active group changes.
  useEffect(() => {
    refCallbackCacheRef.current.clear();
    receiptRefCallbackCacheRef.current.clear();
    messageRefs.current.clear();
    receiptContainerRefs.current.clear();
  }, [activeGroupId]);

  async function copyMessage(item: MessageResponse) {
    const text = item.text || item.attachment?.originalName || '这条消息没有可复制的文本。';
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        onCopyMessage?.('消息内容已复制。');
        return;
      }
    } catch {}

    if (fallbackCopyText(text)) {
      onCopyMessage?.('消息内容已复制。');
      return;
    }

    onUnsupportedAction?.('当前环境无法访问剪贴板。');
  }

  function jumpToMessage(messageId: string) {
    const target = messageRefs.current.get(messageId);
    if (!target) {
      onUnsupportedAction?.('当前找不到原始消息。');
      return;
    }

    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const menuItems: ContextMenuItem[] = menuState
    ? (() => {
        const isSystem = menuState.item.type === 'system';
        const ownMessage = menuState.item.senderId === currentUserId;
        const notRevoked = !menuState.item.revokedAt;
        const canEdit = ownMessage && notRevoked && menuState.item.type === 'text';
        const canSelfRevoke = ownMessage && notRevoked;

        if (isSystem) {
          return [
            {
              key: 'copy',
              label: '复制',
              onSelect: () => {
                void copyMessage(menuState.item);
              },
            },
          ];
        }

        return [
          {
            key: 'reply',
            label: '回复',
            onSelect: () => onReply(menuState.item.id),
          },
          {
            key: 'copy',
            label: '复制',
            onSelect: () => {
              void copyMessage(menuState.item);
            },
          },
          ...(menuState.item.replyTo
            ? [
                {
                  key: 'jump-original' as const,
                  label: '转到原文',
                  onSelect: () => {
                    jumpToMessage(menuState.item.replyTo!.id);
                  },
                },
              ]
            : []),
          ...(canEdit
            ? [
                {
                  key: 'edit' as const,
                  label: '编辑',
                  separatorBefore: true,
                  onSelect: () => {
                    setEditingMessageId(menuState.item.id);
                    setEditText(menuState.item.text ?? '');
                    handleCloseMenu();
                  },
                },
              ]
            : []),
          ...(canSelfRevoke
            ? [
                {
                  key: 'revoke' as const,
                  label: '撤回',
                  danger: true,
                  separatorBefore: !canEdit,
                  onSelect: () => {
                    onRevokeMessage?.(menuState.item.id);
                    handleCloseMenu();
                  },
                },
              ]
            : []),
        ];
      })()
    : [];

  return (
    <section
      ref={streamRef}
      className={styles.stream}
      data-testid="workspace-surface"
      onScroll={handleScroll}
    >
      <MessageMediaProvider rootRef={streamRef} scopeKey={activeGroupId}>
        <MessageList
          accessToken={resolvedAccessToken}
          activeReceiptMessageId={activeReceiptMessageId}
          currentUserId={currentUserId}
          currentUserMentionTargets={currentUserMentionTargets}
          canManageFileShare={canManageFileShare}
          artifactAction={artifactAction}
          editText={editText}
          editingMessageId={editingMessageId}
          hasMoreOlderMessages={hasMoreOlderMessages}
          isLoadingMessages={isLoadingMessages}
          loadError={messageLoadError}
          isLoadingOlderMessages={isLoadingOlderMessages}
          messages={messages}
          pendingUploads={pendingUploads}
          registerMessageRef={registerMessageRef}
          registerReceiptContainerRef={registerReceiptContainerRef}
          onClearPendingError={onClearPendingError}
          onContextMenu={(item, position) => setMenuState({ item, ...position })}
          onEditMessage={onEditMessage}
          onJumpToMessage={jumpToMessage}
          onPreviewImage={imagePreview.setPreviewImage}
          onReply={onReply}
          onRetryPendingUpload={onRetryPendingUpload}
          onRetryPendingMessage={onRetryPendingMessage}
          onMessageContentResized={handleContentResized}
          onSetActiveReceiptMessageId={setActiveReceiptMessageId}
          onSetEditingMessageId={setEditingMessageId}
          onSetEditText={setEditText}
        />
      </MessageMediaProvider>
      {imagePreview.previewImage ? (
        <ImagePreviewDialog
          activeDimensions={imagePreview.activeDimensions}
          canPan={imagePreview.canPan}
          fitScale={imagePreview.fitScale}
          image={imagePreview.previewImage}
          offset={imagePreview.previewOffset}
          scale={imagePreview.previewScale}
          stageRef={imagePreview.previewStageRef}
          onClose={imagePreview.closePreview}
          onImageLoad={imagePreview.setPreviewNaturalSize}
          onImagePointerDown={imagePreview.handlePreviewPointerDown}
          onWheel={imagePreview.handlePreviewWheel}
        />
      ) : null}
      <ContextMenu
        items={menuItems}
        position={menuState ? { x: menuState.x, y: menuState.y } : null}
        onClose={handleCloseMenu}
      />
    </section>
  );
}
