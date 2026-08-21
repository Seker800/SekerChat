import { useMemo, useState, type Ref } from 'react';
import { downloadFile, resolveApiResourceUrl } from '../../lib/api-core';
import type { MessageResponse } from '../../lib/messages-files-api';
import { userDisplayName } from '../../lib/users-api';
import { formatTimestamp } from '../../utils/time';
import { Avatar } from '../shared/Avatar';
import { FileAttachmentCard } from './FileAttachmentCard';
import { FileShareDialog, type ManagedFileShare } from './FileShareDialog';
import {
  getFileShare,
  revokeFileShare,
  rotateFileShare,
  saveFileShare,
} from '../../lib/file-shares-api';
import { ProtectedImageAttachment } from './ProtectedImageAttachment';
import {
  isReadReceiptComplete,
  readReceiptAriaLabel,
  ReadReceiptPopover,
} from './ReadReceiptPopover';
import {
  isAttachmentMessageWithoutAttachment,
  renderMessageHtml,
  senderLabel,
} from './messagePaneUtils';
import styles from './MessagePane.module.css';
import type { PreviewImage } from '../media/image-preview/useImagePreviewState';
import type { MessageArtifactAction } from './messageArtifactAction';

interface MessageItemProps {
  accessToken?: string;
  activeReceiptMessageId: string | null;
  currentUserId: string;
  currentUserMentionTargets?: string[];
  canManageFileShare?: (attachment: NonNullable<MessageResponse['attachment']>) => boolean;
  artifactAction?: MessageArtifactAction;
  editText: string;
  editingMessageId: string | null;
  isCompact: boolean;
  item: MessageResponse;
  messageRef: Ref<HTMLElement>;
  receiptContainerRef: Ref<HTMLDivElement>;
  onClearPendingError?: (localId: string) => void;
  onRetryPendingMessage?: (localId: string) => void;
  onContextMenu: (item: MessageResponse, position: { x: number; y: number }) => void;
  onEditMessage?: (messageId: string, text: string) => void;
  onPreviewImage: (image: PreviewImage) => void;
  onJumpToMessage?: (messageId: string) => void;
  onReply: (messageId: string) => void;
  onMessageContentResized: () => void;
  onSetActiveReceiptMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  onSetEditingMessageId: React.Dispatch<React.SetStateAction<string | null>>;
  onSetEditText: React.Dispatch<React.SetStateAction<string>>;
}

export function MessageItem({
  accessToken,
  activeReceiptMessageId,
  currentUserId,
  currentUserMentionTargets,
  canManageFileShare,
  artifactAction,
  editText,
  editingMessageId,
  isCompact,
  item,
  messageRef,
  receiptContainerRef,
  onClearPendingError,
  onRetryPendingMessage,
  onContextMenu,
  onEditMessage,
  onJumpToMessage,
  onPreviewImage,
  onReply,
  onMessageContentResized,
  onSetActiveReceiptMessageId,
  onSetEditingMessageId,
  onSetEditText,
}: MessageItemProps) {
  const [managedShare, setManagedShare] = useState<ManagedFileShare | null>(null);
  const [shareTarget, setShareTarget] = useState<NonNullable<MessageResponse['attachment']> | null>(
    null,
  );
  const [shareError, setShareError] = useState('');
  const isCurrentUserMessage = item.senderId === currentUserId;
  const isMentioningCurrentUser = item.mentionedUserIds.includes(currentUserId);
  const renderedText = useMemo(() => {
    return renderMessageHtml(
      item.text,
      item.type === 'text',
      isMentioningCurrentUser,
      currentUserMentionTargets,
    );
  }, [currentUserMentionTargets, isMentioningCurrentUser, item.text, item.type]);

  const attachmentContentUrl = useMemo(
    () => (item.attachment ? resolveApiResourceUrl(item.attachment.contentUrl) : ''),
    [item.attachment?.contentUrl],
  );
  const attachmentThumbnailUrl = useMemo(
    () =>
      item.attachment?.thumbnailUrl ? resolveApiResourceUrl(item.attachment.thumbnailUrl) : '',
    [item.attachment?.thumbnailUrl],
  );
  const replyAttachmentContentUrl = useMemo(
    () =>
      item.replyTo?.attachment ? resolveApiResourceUrl(item.replyTo.attachment.contentUrl) : '',
    [item.replyTo?.attachment?.contentUrl],
  );
  const replyAttachmentThumbnailUrl = useMemo(
    () =>
      item.replyTo?.attachment?.thumbnailUrl
        ? resolveApiResourceUrl(item.replyTo.attachment.thumbnailUrl)
        : '',
    [item.replyTo?.attachment?.thumbnailUrl],
  );

  const articleClassName = useMemo(
    () =>
      [
        item.type === 'system' ? styles.systemMessage : styles.message,
        item.type === 'system' ? '' : isCompact ? styles.messageCompact : styles.messageRegular,
        item.type === 'system' ? '' : isCurrentUserMessage ? styles.messageMine : '',
        item.type === 'image' ? styles.messageImageAttachment : '',
        item.type === 'file' ? styles.messageFileAttachment : '',
      ]
        .filter(Boolean)
        .join(' '),
    [isCompact, isCurrentUserMessage, item.type],
  );

  async function handleOpenAttachment(attachment: NonNullable<MessageResponse['attachment']>) {
    if (attachment.kind !== 'file') {
      return;
    }

    const contentUrl = resolveApiResourceUrl(attachment.contentUrl);

    if (!accessToken) {
      window.open(contentUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      await downloadFile(contentUrl, attachment.originalName, accessToken);
    } catch (err) {
      console.warn('Protected attachment download failed:', err);
    }
  }

  async function handleShareAttachment(attachment: NonNullable<MessageResponse['attachment']>) {
    if (!accessToken) return;
    try {
      setShareError('');
      const share = await getFileShare(accessToken, attachment.groupId, attachment.fileId);
      setShareTarget(attachment);
      setManagedShare(share);
    } catch (reason) {
      setShareError(reason instanceof Error ? reason.message : '无法打开分享设置。');
    }
  }

  function artifactButtonFor(attachment: NonNullable<MessageResponse['attachment']>) {
    if (!artifactAction?.isEnabled) return null;
    const isAdded = artifactAction.addedFileIds.has(attachment.fileId);
    const isPending = artifactAction.pendingFileIds.has(attachment.fileId);
    const label = isAdded ? '已添加到产出' : isPending ? '添加中' : '添加到产出';

    return (
      <button
        className={`${styles.addToArtifactsButton} ${isAdded ? styles.addToArtifactsButtonDone : ''}`}
        type="button"
        aria-label={label}
        disabled={artifactAction.isLocked || isAdded || isPending}
        title={artifactAction.isLocked ? '当前产出已确认，请先解除确认' : label}
        onClick={() => artifactAction.onAdd(attachment.fileId)}
      >
        {isAdded ? '✓ 已添加' : isPending ? '添加中…' : '+ 添加到产出'}
      </button>
    );
  }

  return (
    <article
      ref={messageRef}
      className={articleClassName}
      data-testid="message-card"
      data-message-id={item.id}
      onContextMenu={(event) => {
        if (item.isSending) return;
        event.preventDefault();
        onContextMenu(item, { x: event.clientX, y: event.clientY });
      }}
    >
      {item.type !== 'system' && (
        <div className={styles.avatarColumn}>
          {isCompact ? null : (
            <Avatar
              avatarUrl={item.sender.avatarUrl}
              name={senderLabel(item)}
              size={40}
              accessToken={accessToken}
            />
          )}
        </div>
      )}
      <div className={styles.body}>
        {item.type === 'system' ? (
          <div className={styles.systemBody}>{item.text}</div>
        ) : (
          <>
            {isCompact ? null : (
              <div className={styles.meta}>
                <span className={styles.sender}>{senderLabel(item)}</span>
                <span className={styles.time}>
                  {formatTimestamp(item.createdAt)}
                  {item.editedAt && !item.revokedAt ? (
                    <span className={styles.editedMark}> 已编辑</span>
                  ) : null}
                </span>
              </div>
            )}

            {item.revokedAt ? (
              <div className={styles.revoked}>消息已撤回</div>
            ) : (
              <>
                {item.replyTo ? (
                  item.replyTo.attachment?.kind === 'file' ? (
                    <div className={styles.reply}>
                      <button
                        className={styles.replyJump}
                        type="button"
                        onClick={() => onJumpToMessage?.(item.replyTo!.id)}
                      >
                        <span className={styles.replyLabel}>
                          回复 {userDisplayName(item.replyTo.sender)}
                        </span>
                        {item.replyTo.textPreview ? (
                          <span className={styles.replyPreview}>{item.replyTo.textPreview}</span>
                        ) : null}
                      </button>
                      <FileAttachmentCard
                        compact
                        filename={item.replyTo.attachment.originalName}
                        size={item.replyTo.attachment.size}
                        isSharing={item.replyTo.attachment.isSharing}
                        canShare={
                          canManageFileShare?.(item.replyTo.attachment) ??
                          item.replyTo.attachment.uploaderId === currentUserId
                        }
                        onShare={() => void handleShareAttachment(item.replyTo!.attachment!)}
                        onDownload={() => void handleOpenAttachment(item.replyTo!.attachment!)}
                      />
                    </div>
                  ) : (
                    <div className={styles.reply}>
                      <button
                        className={styles.replyJump}
                        type="button"
                        onClick={() => onJumpToMessage?.(item.replyTo!.id)}
                      >
                        <span className={styles.replyLabel}>
                          回复 {userDisplayName(item.replyTo.sender)}
                        </span>
                        {item.replyTo.textPreview ? (
                          <span className={styles.replyPreview}>{item.replyTo.textPreview}</span>
                        ) : null}
                      </button>
                      {item.replyTo.attachment?.kind === 'image' ? (
                        <span className={styles.replyPreview} style={{ whiteSpace: 'normal' }}>
                          <ProtectedImageAttachment
                            accessToken={accessToken}
                            viewerId={currentUserId}
                            src={replyAttachmentThumbnailUrl || replyAttachmentContentUrl}
                            previewSrc={replyAttachmentContentUrl}
                            alt={item.replyTo.attachment.originalName}
                            imageWidth={item.replyTo.attachment.width}
                            imageHeight={item.replyTo.attachment.height}
                            onPreview={onPreviewImage}
                          />
                        </span>
                      ) : null}
                    </div>
                  )
                ) : null}

                <div className={styles.actions}>
                  {isCurrentUserMessage &&
                  item.readReceipt &&
                  item.readReceipt.totalRecipients > 0 ? (
                    <div
                      ref={receiptContainerRef}
                      className={styles.receiptRow}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          onSetActiveReceiptMessageId(null);
                        }
                      }}
                    >
                      <button
                        className={styles.receiptTrigger}
                        type="button"
                        onMouseEnter={() => onSetActiveReceiptMessageId(item.id)}
                        onMouseLeave={() =>
                          onSetActiveReceiptMessageId((current) =>
                            current === item.id ? null : current,
                          )
                        }
                        onFocus={() => onSetActiveReceiptMessageId(item.id)}
                        onBlur={() =>
                          onSetActiveReceiptMessageId((current) =>
                            current === item.id ? null : current,
                          )
                        }
                        aria-haspopup="dialog"
                        aria-expanded={activeReceiptMessageId === item.id}
                        aria-label={readReceiptAriaLabel(item.readReceipt)}
                        title={readReceiptAriaLabel(item.readReceipt)}
                        style={
                          {
                            '--receipt-progress': `${
                              item.readReceipt.totalRecipients > 0
                                ? (item.readReceipt.readCount / item.readReceipt.totalRecipients) *
                                  100
                                : 0
                            }%`,
                          } as React.CSSProperties
                        }
                      >
                        {isReadReceiptComplete(item.readReceipt) ? (
                          <span className={styles.receiptCheckBadge} aria-hidden="true">
                            <span className={styles.receiptCheckmark}>✓</span>
                          </span>
                        ) : (
                          <span className={styles.receiptRing} aria-hidden="true" />
                        )}
                      </button>
                      {activeReceiptMessageId === item.id ? (
                        <div
                          onMouseEnter={() => onSetActiveReceiptMessageId(item.id)}
                          onMouseLeave={() =>
                            onSetActiveReceiptMessageId((current) =>
                              current === item.id ? null : current,
                            )
                          }
                        >
                          <ReadReceiptPopover
                            receipt={item.readReceipt}
                            accessToken={accessToken}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {!item.isSending ? (
                    <button
                      className={styles.actionButton}
                      type="button"
                      onClick={() => onReply(item.id)}
                    >
                      回复
                    </button>
                  ) : null}
                </div>

                {editingMessageId === item.id ? (
                  <div className={styles.editArea}>
                    <textarea
                      className={styles.editInput}
                      value={editText}
                      onChange={(event) => onSetEditText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault();
                          if (editText.trim()) {
                            onEditMessage?.(item.id, editText.trim());
                            onSetEditingMessageId(null);
                            onSetEditText('');
                          }
                        }
                        if (event.key === 'Escape') {
                          onSetEditingMessageId(null);
                          onSetEditText('');
                        }
                      }}
                      autoFocus
                      rows={3}
                    />
                    <div className={styles.editHint}>Enter 提交 · Esc 取消</div>
                  </div>
                ) : (
                  <>
                    {renderedText ? (
                      <div
                        className={styles.content}
                        dangerouslySetInnerHTML={{ __html: renderedText }}
                      />
                    ) : null}

                    {item.attachment ? (
                      item.attachment.kind === 'image' ? (
                        <ProtectedImageAttachment
                          accessToken={accessToken}
                          viewerId={currentUserId}
                          src={attachmentThumbnailUrl || attachmentContentUrl}
                          previewSrc={attachmentContentUrl}
                          alt={item.attachment.originalName}
                          imageWidth={item.attachment.width}
                          imageHeight={item.attachment.height}
                          onLoad={onMessageContentResized}
                          onPreview={onPreviewImage}
                          accessory={artifactButtonFor(item.attachment)}
                        />
                      ) : (
                        <FileAttachmentCard
                          filename={item.attachment.originalName}
                          size={item.attachment.size}
                          isSharing={item.attachment.isSharing}
                          canShare={
                            canManageFileShare?.(item.attachment) ??
                            item.attachment.uploaderId === currentUserId
                          }
                          onShare={() => void handleShareAttachment(item.attachment!)}
                          onDownload={() => void handleOpenAttachment(item.attachment!)}
                          accessory={artifactButtonFor(item.attachment)}
                        />
                      )
                    ) : isAttachmentMessageWithoutAttachment(item) ? (
                      <div className={styles.attachmentExpired}>该附件已过期回收</div>
                    ) : null}
                  </>
                )}

                {item.sendError ? (
                  <div className={styles.sendError}>
                    <span className={styles.sendErrorText}>{item.sendError}</span>
                    <button
                      className={styles.pendingDismiss}
                      type="button"
                      onClick={() => onRetryPendingMessage?.(item.id)}
                    >
                      重发
                    </button>
                    <button
                      className={styles.pendingDismiss}
                      type="button"
                      onClick={() => onClearPendingError?.(item.id)}
                    >
                      关闭
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
      {managedShare && shareTarget ? (
        <FileShareDialog
          filename={shareTarget.originalName}
          initialShare={managedShare}
          onClose={() => {
            setManagedShare(null);
            setShareTarget(null);
          }}
          onSave={async (input) =>
            setManagedShare(
              await saveFileShare(accessToken!, shareTarget.groupId, shareTarget.fileId, input),
            )
          }
          onRevoke={async () =>
            setManagedShare(
              await revokeFileShare(accessToken!, shareTarget.groupId, shareTarget.fileId),
            )
          }
          onRotateLink={async (input) => {
            const nextShare = await rotateFileShare(
              accessToken!,
              shareTarget.groupId,
              shareTarget.fileId,
              input,
            );
            setManagedShare(nextShare);
          }}
        />
      ) : null}
      {shareError ? (
        <div role="alert" className={styles.attachmentExpired}>
          {shareError}
        </div>
      ) : null}
    </article>
  );
}
