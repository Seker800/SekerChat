import { useMemo, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { createOrGetDM } from '../../lib/dm-api';
import type { UserOptionResponse } from '../../lib/groups-api';
import { Avatar } from '../shared/Avatar';
import styles from './StartDMDialog.module.css';

interface StartDMDialogProps {
  accessToken?: string;
  users: UserOptionResponse[];
  currentUserId: string;
  isOpen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onDMStarted: (dmGroupId: string, dmGroup?: import('../../lib/groups-api').GroupResponse) => void;
  onError: (message: string) => void;
}

export function StartDMDialog({
  accessToken,
  users,
  currentUserId,
  isOpen,
  isLoading,
  onClose,
  onDMStarted,
  onError,
}: StartDMDialogProps) {
  const resolvedAccessToken = useResolvedAccessToken(accessToken);
  const [query, setQuery] = useState('');
  const [pendingUserId, setPendingUserId] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users.filter((u) => u.id !== currentUserId);
    return users.filter(
      (u) =>
        u.id !== currentUserId &&
        (u.displayName?.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)),
    );
  }, [users, currentUserId, query]);

  async function startDM(userId: string) {
    try {
      setPendingUserId(userId);
      const dmGroup = await createOrGetDM(resolvedAccessToken, userId);
      onDMStarted(dmGroup.id, dmGroup);
    } catch (e) {
      onError(e instanceof Error ? e.message : '发起私聊失败。');
    } finally {
      setPendingUserId('');
    }
  }

  if (!isOpen) return null;

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="新建私聊"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h3 className={styles.title}>新建私聊</h3>
          <button className={styles.closeButton} type="button" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className={styles.searchArea}>
          <input
            className={styles.searchInput}
            type="text"
            placeholder="搜索用户（名字 / 邮箱）..."
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.list}>
          {isLoading ? (
            <p className={styles.empty}>加载中...</p>
          ) : filtered.length === 0 ? (
            <p className={styles.empty}>
              {users.length <= 1 ? '系统中暂无其他用户，请等待管理员邀请。' : '没有匹配的用户'}
            </p>
          ) : (
            filtered.map((user) => (
              <button
                key={user.id}
                className={styles.userRow}
                type="button"
                disabled={pendingUserId === user.id}
                onClick={() => { void startDM(user.id); }}
              >
                <Avatar
                  avatarUrl={null}
                  name={user.displayName || user.email}
                  size={36}
                />
                <div className={styles.userCopy}>
                  <strong>{user.displayName || user.email}</strong>
                  <span>{user.email}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
