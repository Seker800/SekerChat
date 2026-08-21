import { useLayoutEffect, useRef, type ClipboardEvent as ReactClipboardEvent } from 'react';
import type { MentionSuggestion } from './useComposer';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { MessageResponse } from '../../lib/messages-files-api';
import styles from './Composer.module.css';

interface ComposerProps {
  channelName: string;
  text: string;
  isSending: boolean;
  isUploading: boolean;
  replyTarget: MessageResponse | null;
  onChange: (value: string) => void;
  onClearReply: () => void;
  onPickAttachments: (files: File[]) => void;
  onSend: () => void;
  isMentionActive?: boolean;
  mentionSuggestions?: MentionSuggestion[];
  mentionActiveIndex?: number;
  onMentionNavigate?: (direction: 'up' | 'down') => void;
  onMentionSelect?: (suggestion: MentionSuggestion) => void;
  onMentionDismiss?: () => void;
}

function extensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/jpeg') return 'jpg';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/gif') return 'gif';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'image/svg+xml') return 'svg';
  return 'png';
}

function normalizeClipboardImageFile(file: File): File {
  if (file.name.trim()) {
    return file;
  }

  const extension = extensionForMimeType(file.type);
  return new File([file], `clipboard-image-${Date.now()}.${extension}`, {
    type: file.type || 'image/png',
    lastModified: Date.now(),
  });
}

function extractClipboardImageFiles(event: ReactClipboardEvent<HTMLTextAreaElement>): File[] {
  const directFiles = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
  if (directFiles.length > 0) {
    return directFiles.map(normalizeClipboardImageFile);
  }

  const itemFiles = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file instanceof File);

  return itemFiles.map(normalizeClipboardImageFile);
}

export function Composer({
  channelName,
  text,
  isSending,
  isUploading,
  replyTarget,
  onChange,
  onClearReply,
  onPickAttachments,
  onSend,
  isMentionActive,
  mentionSuggestions,
  mentionActiveIndex,
  onMentionNavigate,
  onMentionSelect,
  onMentionDismiss,
}: ComposerProps) {
  const isNarrowViewport = useMediaQuery('(max-width: 880px)');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mediaInputId = 'composer-media-input';
  const fileInputId = 'composer-file-input';
  const isEdgeAndroid = typeof navigator !== 'undefined' && /EdgA\//.test(navigator.userAgent);
  const fileInputAccept = isEdgeAndroid
    ? 'application/*,text/*,.zip,.rar,.7z,.csv,.json,.xml,.md'
    : '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.txt,.md,.csv,.json,.xml,.apk,.ipa,.psd,.ai,.sketch';
  const fileInputMultiple = !isEdgeAndroid;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    const resizeTextarea = () => {
      textarea.style.height = '0px';
      const contentHeight = textarea.scrollHeight;
      const maxHeight = 180;
      textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
      textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
    };

    resizeTextarea();
    window.addEventListener('resize', resizeTextarea);
    return () => window.removeEventListener('resize', resizeTextarea);
  }, [text]);

  return (
    <div className={styles.composer} data-testid="workspace-composer-panel">
      {replyTarget ? (
        <div className={styles.reply} data-testid="reply-banner">
          <div className={styles.bannerCopy}>
            <strong>回复中</strong>
            <span>
              正在回复 {replyTarget.sender.displayName || replyTarget.sender.email}
              {replyTarget.attachment
                ? replyTarget.attachment.kind === 'image'
                  ? ` · 🖼 ${replyTarget.attachment.originalName}`
                  : ` · 📎 ${replyTarget.attachment.originalName}`
                : ''}
            </span>
          </div>
          <button className={styles.bannerButton} type="button" onClick={onClearReply}>
            关闭
          </button>
        </div>
      ) : null}
      <div className={styles.shell}>
        <input
          id={mediaInputId}
          className={styles.visuallyHiddenInput}
          multiple
          accept="image/*,video/*"
          data-testid="composer-media-input"
          type="file"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            onPickAttachments(files);
            event.currentTarget.value = '';
          }}
        />
        <input
          id={fileInputId}
          className={styles.visuallyHiddenInput}
          multiple={fileInputMultiple}
          accept={fileInputAccept}
          data-testid="composer-attachment-input"
          type="file"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            onPickAttachments(files);
            event.currentTarget.value = '';
          }}
        />
        <div className={styles.inputRow}>
          <label
            className={styles.attachButton}
            htmlFor={mediaInputId}
            title={isNarrowViewport ? '上传图片或视频' : '上传附件'}
          >
            <span>+</span>
          </label>
          {isNarrowViewport ? (
            <label
              className={styles.fileButton}
              htmlFor={fileInputId}
              title="上传文件"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true" className={styles.fileIcon}>
                <path
                  d="M5 2.5h4.25L12.5 5.75V13a1 1 0 0 1-1 1h-6A1.5 1.5 0 0 1 4 12.5v-8A2 2 0 0 1 6 2.5Z"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinejoin="round"
                />
                <path d="M9.25 2.5v3h3" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
                <path d="M6.5 9.25h3.5M6.5 11h3.5" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
              </svg>
            </label>
          ) : null}
          <div className={styles.editor}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              data-testid="message-composer"
              rows={1}
              wrap="soft"
              placeholder={`发送消息到 #${channelName}`}
              value={text}
              onChange={(event) => onChange(event.target.value)}
              onPaste={(event) => {
                const imageFiles = extractClipboardImageFiles(event);
                if (imageFiles.length === 0) {
                  return;
                }

                event.preventDefault();
                onPickAttachments(imageFiles);
              }}
              onKeyDown={(event) => {
                if (isMentionActive && mentionSuggestions && mentionSuggestions.length > 0) {
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    onMentionNavigate?.('up');
                    return;
                  }
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    onMentionNavigate?.('down');
                    return;
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    const idx = mentionActiveIndex ?? 0;
                    const suggestion = mentionSuggestions[idx];
                    if (suggestion) {
                      onMentionSelect?.(suggestion);
                    }
                    return;
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    onMentionDismiss?.();
                    return;
                  }
                }

                if (event.key === 'Enter' && !event.shiftKey && text.trim()) {
                  event.preventDefault();
                  onSend();
                }
              }}
            />
            {isMentionActive && mentionSuggestions && mentionSuggestions.length > 0 ? (
              <div className={styles.mentionDropdown} data-testid="mention-dropdown">
                {mentionSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.userId}
                    className={`${styles.mentionItem} ${index === (mentionActiveIndex ?? 0) ? styles.mentionItemActive : ''}`}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onMentionSelect?.(suggestion);
                    }}
                  >
                    <span className={styles.mentionName}>{suggestion.displayName}</span>
                    <span className={styles.mentionEmail}>{suggestion.email}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className={styles.primaryActions} data-testid="workspace-primary-actions">
            <button className={styles.send} disabled={!text.trim()} onClick={onSend}>
              {isSending ? '发送中' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
