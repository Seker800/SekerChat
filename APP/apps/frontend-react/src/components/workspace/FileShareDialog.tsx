import { useEffect, useMemo, useState } from 'react';
import { IconCheck, IconCopy, IconLink, IconRefresh, IconX } from '@tabler/icons-react';
import { userDisplayName } from '../../lib/users-api';
import { Avatar } from '../shared/Avatar';
import styles from './FileShareDialog.module.css';

const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{12,64}$/;
const LEGACY_PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d]{4}$/;
const GENERATED_PASSWORD_LENGTH = 16;
const PASSWORD_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const DEFAULT_SHARE_DURATION_MS = 3 * 24 * 60 * 60 * 1_000;

export type FileShareStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'CHANNEL_ARCHIVED' | 'DRAFT';

export type ManagedFileShare = {
  exists: boolean;
  url: string;
  password: string;
  expiresAt: string;
  status: FileShareStatus;
  downloadCount: number;
  lastDownloadedAt: string | null;
  activatedBy: {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
  } | null;
};

type FileShareDialogProps = {
  filename: string;
  initialShare: ManagedFileShare;
  onClose: () => void;
  onSave: (input: { password: string; expiresAt: string }) => Promise<void> | void;
  onRevoke: () => Promise<void> | void;
  onRotateLink: (input: { password: string }) => Promise<void> | void;
};

function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function generatePassword(): string {
  const characters = [
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789',
    PASSWORD_CHARACTERS,
  ].map((set) => {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return set[value[0] % set.length];
  });

  while (characters.length < GENERATED_PASSWORD_LENGTH) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    characters.push(PASSWORD_CHARACTERS[value[0] % PASSWORD_CHARACTERS.length]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    const swapIndex = value[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Some HTTP or embedded environments expose Clipboard API but reject it.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy') ?? false;
  textarea.remove();
  if (!copied) throw new Error('复制失败，请手动复制地址和密码');
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

const statusLabels: Record<FileShareStatus, string> = {
  ACTIVE: '分享中',
  EXPIRED: '已过期',
  REVOKED: '已关闭',
  CHANNEL_ARCHIVED: '频道已归档',
  DRAFT: '尚未创建',
};

const inactiveDescriptions: Record<Exclude<FileShareStatus, 'ACTIVE'>, string> = {
  DRAFT: '开启后会生成新的下载链接和密码。',
  REVOKED: '当前分享已关闭，原公开链接已失效。重新开启会生成新的链接和密码。',
  EXPIRED: '原分享已过期，重新开启会生成新的链接和密码。',
  CHANNEL_ARCHIVED: '频道已归档，无法开启公开分享。',
};

function inactiveDescription(status: FileShareStatus): string {
  return status === 'ACTIVE' ? '' : inactiveDescriptions[status];
}

export function FileShareDialog({
  filename,
  initialShare,
  onClose,
  onSave,
  onRevoke,
  onRotateLink,
}: FileShareDialogProps) {
  const isActive = initialShare.status === 'ACTIVE';
  const canActivate = initialShare.status !== 'CHANNEL_ARCHIVED';
  const [password, setPassword] = useState(() =>
    isActive ? initialShare.password : generatePassword(),
  );
  const [expiresAt, setExpiresAt] = useState(() =>
    isActive
      ? toLocalDateTimeInput(initialShare.expiresAt)
      : toLocalDateTimeInput(new Date(Date.now() + DEFAULT_SHARE_DURATION_MS).toISOString()),
  );
  const [savedSettings, setSavedSettings] = useState(() => ({
    password: initialShare.password,
    expiresAt: toLocalDateTimeInput(initialShare.expiresAt),
  }));
  const [activeAction, setActiveAction] = useState<'save' | 'copy' | 'revoke' | 'rotate' | null>(
    null,
  );
  const [copyState, setCopyState] = useState('');
  const [actionError, setActionError] = useState('');
  const copyText = useMemo(
    () =>
      [
        `下载地址：${initialShare.url}`,
        `密码：${password}`,
        `有效期至：${new Date(expiresAt).toLocaleString()}`,
      ].join('\n'),
    [expiresAt, initialShare.url, password],
  );

  useEffect(() => {
    if (!copyState) return;
    const timer = window.setTimeout(() => setCopyState(''), 1_800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (isActive) {
      const nextExpiresAt = toLocalDateTimeInput(initialShare.expiresAt);
      setPassword(initialShare.password);
      setExpiresAt(nextExpiresAt);
      setSavedSettings({ password: initialShare.password, expiresAt: nextExpiresAt });
      return;
    }
    if (!canActivate) return;
    setPassword(generatePassword());
    setExpiresAt(
      toLocalDateTimeInput(new Date(Date.now() + DEFAULT_SHARE_DURATION_MS).toISOString()),
    );
  }, [canActivate, initialShare.expiresAt, initialShare.password, isActive]);

  async function handleSave() {
    setCopyState('');
    setActionError('');
    if (!PASSWORD_PATTERN.test(password) && !LEGACY_PASSWORD_PATTERN.test(password)) {
      setActionError('密码需为 12 至 64 位字母和数字，并同时包含大小写字母和数字');
      return;
    }
    const passwordToSave = PASSWORD_PATTERN.test(password) ? password : generatePassword();
    const expiry = new Date(expiresAt);
    if (!expiresAt || Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) {
      setActionError('有效期必须是未来时间');
      return;
    }
    setActiveAction('save');
    try {
      await onSave({ password: passwordToSave, expiresAt: expiry.toISOString() });
      setPassword(passwordToSave);
      setSavedSettings({ password: passwordToSave, expiresAt });
      setCopyState(isActive ? '已保存' : initialShare.exists ? '已重新开启' : '已开启');
    } catch (error) {
      setActionError(errorMessage(error, isActive ? '保存失败，请重试' : '开启失败，请重试'));
    } finally {
      setActiveAction(null);
    }
  }

  async function handleCopy() {
    setCopyState('');
    setActionError('');
    setActiveAction('copy');
    try {
      await copyToClipboard(copyText);
      setCopyState('已复制');
    } catch (error) {
      setActionError(errorMessage(error, '复制失败，请手动复制'));
    } finally {
      setActiveAction(null);
    }
  }

  async function handleSecondaryAction(action: 'revoke' | 'rotate') {
    setCopyState('');
    setActionError('');
    setActiveAction(action);
    try {
      if (action === 'revoke') {
        await onRevoke();
        setCopyState('已关闭');
      } else {
        const nextPassword = generatePassword();
        await onRotateLink({ password: nextPassword });
        setPassword(nextPassword);
        setSavedSettings({ password: nextPassword, expiresAt });
        setCopyState('链接和密码已更新');
      }
    } catch (error) {
      setActionError(
        errorMessage(
          error,
          action === 'revoke' ? '撤销失败，请重试' : '更新链接和密码失败，请重试',
        ),
      );
    } finally {
      setActiveAction(null);
    }
  }

  const isBusy = activeAction !== null;
  const hasChanges =
    isActive && (password !== savedSettings.password || expiresAt !== savedSettings.expiresAt);
  const toggleLabel =
    activeAction === 'revoke'
      ? '正在关闭…'
      : activeAction === 'save' && !isActive
        ? '正在开启…'
        : initialShare.status === 'CHANNEL_ARCHIVED'
          ? '分享已关闭（频道已归档）'
          : isActive
            ? '分享已开启'
            : '分享已关闭';

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-label="文件分享">
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <span className={styles.titleIcon} aria-hidden="true">
              <IconLink size={18} stroke={1.8} />
            </span>
            <h2>{filename}</h2>
          </div>
          <div className={styles.headerMeta} aria-label="分享状态">
            {copyState ? (
              <div className={styles.transientStatus} role="status">
                <IconCheck size={13} aria-hidden="true" />
                {copyState}
              </div>
            ) : (
              <div className={styles.statusRow}>
                <span className={styles.statusDot} data-status={initialShare.status} />
                <span>{statusLabels[initialShare.status]}</span>
                {isActive ? (
                  <>
                    <span className={styles.statusSeparator}>·</span>
                    <span>下载 {initialShare.downloadCount} 次</span>
                  </>
                ) : null}
              </div>
            )}
            {isActive && initialShare.activatedBy ? (
              <div
                className={styles.activator}
                aria-label={`激活者 ${userDisplayName(initialShare.activatedBy)}`}
              >
                <Avatar
                  avatarUrl={initialShare.activatedBy.avatarUrl}
                  name={userDisplayName(initialShare.activatedBy)}
                  size={26}
                />
                <strong>{userDisplayName(initialShare.activatedBy)}</strong>
              </div>
            ) : null}
          </div>
          <button className={styles.closeButton} type="button" aria-label="关闭" onClick={onClose}>
            <IconX size={17} aria-hidden="true" />
          </button>
        </header>

        {isActive ? (
          <div className={styles.formGrid}>
            <div className={`${styles.field} ${styles.urlField}`}>
              <span>分享链接</span>
              <div className={styles.inputActionRow}>
                <input aria-label="分享链接" value={initialShare.url} readOnly />
                <button
                  className={styles.iconButton}
                  type="button"
                  aria-label="更新链接和密码"
                  title="更新链接和密码"
                  disabled={isBusy}
                  onClick={() => void handleSecondaryAction('rotate')}
                >
                  <IconRefresh size={15} aria-hidden="true" />
                </button>
                <button
                  className={styles.iconButton}
                  type="button"
                  aria-label="复制分享信息"
                  title="复制链接、密码和有效期"
                  onClick={() => void handleCopy()}
                  disabled={!initialShare.url || isBusy}
                >
                  <IconCopy size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className={styles.field}>
              <span>密码</span>
              <div className={styles.passwordRow}>
                <input
                  aria-label="分享密码"
                  value={password}
                  minLength={12}
                  maxLength={64}
                  pattern="(?=.*[A-Z])(?=.*[a-z])(?=.*\\d)[A-Za-z\\d]{12,64}"
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="重新生成密码"
                  title="重新生成密码"
                  disabled={isBusy}
                  onClick={() => setPassword(generatePassword())}
                >
                  <IconRefresh size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            <label className={styles.field}>
              <span>有效期</span>
              <input
                aria-label="有效期至"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </label>
          </div>
        ) : (
          <div className={styles.inactiveState}>
            <span>{inactiveDescription(initialShare.status)}</span>
          </div>
        )}

        {actionError ? (
          <div className={styles.error} role="alert">
            {actionError}
          </div>
        ) : null}

        <footer className={styles.footer}>
          <div className={styles.toggleControl}>
            <button
              className={styles.shareToggle}
              type="button"
              role="switch"
              aria-label="分享链接"
              aria-checked={isActive}
              data-checked={isActive}
              disabled={isBusy || !canActivate}
              onClick={() => void (isActive ? handleSecondaryAction('revoke') : handleSave())}
            >
              <span className={styles.toggleKnob} aria-hidden="true" />
            </button>
            <span className={styles.toggleLabel}>{toggleLabel}</span>
          </div>
          {isActive && hasChanges ? (
            <>
              <span className={styles.footerSpacer} />
              <button
                className={styles.primaryButton}
                type="button"
                disabled={isBusy}
                onClick={() => void handleSave()}
              >
                {activeAction === 'save' ? '正在保存…' : '保存设置'}
              </button>
            </>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
