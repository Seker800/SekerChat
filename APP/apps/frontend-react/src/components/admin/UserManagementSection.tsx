import { useEffect, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import type { CurrentUserResponse } from '../../lib/auth-api';
import { validateNewPassword } from '../../lib/password-policy';
import { deleteUser, fetchUsers, resetUserPassword, setUserDisabled, updateUserRole, userDisplayName, type UserSummary } from '../../lib/users-api';
import styles from './AdminPage.module.css';

interface UserManagementSectionProps {
  accessToken?: string;
  currentUser: CurrentUserResponse;
  canManageRoles: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: '超级管理员',
  ADMIN: '管理员',
  MEMBER: '成员',
  CLI_BOT: 'Agent Bot',
};

const ROLE_CLASS: Record<string, string> = {
  SUPER_ADMIN: styles.roleAdmin,
  ADMIN: styles.roleAdmin,
  MEMBER: styles.roleMember,
  CLI_BOT: styles.roleMember,
};

function isDeleted(user: UserSummary): boolean {
  return user.email.endsWith('@deleted.local');
}

function isDisabled(user: UserSummary): boolean {
  return isDeleted(user) || Boolean(user.disabledAt);
}

function isSelf(user: UserSummary, currentUser: CurrentUserResponse): boolean {
  return user.id === currentUser.id;
}

function canManage(user: UserSummary, currentUser: CurrentUserResponse): boolean {
  if (isSelf(user, currentUser)) return false;
  if (user.role === 'SUPER_ADMIN') return false;
  if (user.role === 'ADMIN' && currentUser.role !== 'SUPER_ADMIN') return false;
  return true;
}

function canDelete(user: UserSummary, currentUser: CurrentUserResponse): boolean {
  if (isDeleted(user)) return false;
  return canManage(user, currentUser);
}

export function UserManagementSection({ accessToken: providedAccessToken, currentUser, canManageRoles }: UserManagementSectionProps) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState<UserSummary | null>(null);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUsers(accessToken).then((data) => {
      if (cancelled) return;
      setUsers(data.filter((user) => user.role !== 'CLI_BOT'));
      setLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setNotice({ type: 'error', message: '加载用户列表失败' });
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [accessToken]);

  async function toggleRole(user: UserSummary) {
    const newRole = user.role === 'ADMIN' ? 'MEMBER' : 'ADMIN';
    setNotice(null);
    try {
      const updated = await updateUserRole(accessToken, user.id, newRole);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, role: updated.role } : u)));
      setNotice({ type: 'success', message: `已将 ${user.email} 设为 ${ROLE_LABEL[updated.role]}` });
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '操作失败' });
    }
  }

  async function removeUser(user: UserSummary) {
    const confirmed = window.confirm(`确认注销用户 ${user.email}？该用户将被匿名化并无法登录，其消息和文件将保留。`);
    if (!confirmed) return;

    setNotice(null);
    try {
      await deleteUser(accessToken, user.id);
      setUsers((prev) => prev.map((u) =>
        u.id === user.id
          ? { ...u, displayName: null, email: `deleted-${user.id}@deleted.local`, disabledAt: new Date().toISOString() }
          : u,
      ));
      setNotice({ type: 'success', message: `已注销用户 ${user.email}` });
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '注销失败' });
    }
  }

  async function toggleDisabled(user: UserSummary) {
    const nextDisabled = !isDisabled(user);
    const confirmed = window.confirm(
      nextDisabled
        ? `确认停用用户 ${user.email}？停用后该用户将无法登录。`
        : `确认启用用户 ${user.email}？启用后该用户可以重新登录。`,
    );
    if (!confirmed) return;

    setNotice(null);
    try {
      const updated = await setUserDisabled(accessToken, user.id, nextDisabled);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, disabledAt: updated.disabledAt ?? null } : u)));
      setNotice({
        type: 'success',
        message: nextDisabled ? `已停用用户 ${user.email}` : `已启用用户 ${user.email}`,
      });
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '操作失败' });
    }
  }

  async function submitPasswordReset() {
    if (!passwordTarget) return;
    const policyError = validateNewPassword(temporaryPassword);
    if (policyError) {
      setNotice({ type: 'error', message: policyError });
      return;
    }
    if (temporaryPassword !== confirmTemporaryPassword) {
      setNotice({ type: 'error', message: '两次输入的临时密码不一致。' });
      return;
    }

    setIsResettingPassword(true);
    setNotice(null);
    try {
      await resetUserPassword(accessToken, passwordTarget.id, temporaryPassword);
      setUsers((previous) => previous.map((user) => (
        user.id === passwordTarget.id ? { ...user, mustChangePassword: true } : user
      )));
      setNotice({
        type: 'success',
        message: `已重置 ${passwordTarget.email} 的密码；用户下次登录时必须修改密码。`,
      });
      setPasswordTarget(null);
      setTemporaryPassword('');
      setConfirmTemporaryPassword('');
    } catch (error) {
      setNotice({ type: 'error', message: error instanceof Error ? error.message : '重置密码失败。' });
    } finally {
      setIsResettingPassword(false);
    }
  }

  if (!loaded) return null;

  return (
    <section>
      <h3 className={styles.sectionTitle}>用户</h3>

      {notice ? (
        <div className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError} style={{ marginBottom: 10 }}>
          {notice.message}
        </div>
      ) : null}

      {passwordTarget ? (
        <form
          className={styles.passwordResetPanel}
          onSubmit={(event) => {
            event.preventDefault();
            void submitPasswordReset();
          }}
        >
          <div className={styles.passwordResetCopy}>
            <strong>重置 {passwordTarget.email} 的密码</strong>
            <span>设置临时密码后，该用户的现有会话会失效，下次登录必须修改密码。</span>
          </div>
          <input
            className={styles.input}
            type="password"
            autoComplete="new-password"
            placeholder="临时密码"
            value={temporaryPassword}
            onChange={(event) => setTemporaryPassword(event.target.value)}
            required
            minLength={8}
          />
          <input
            className={styles.input}
            type="password"
            autoComplete="new-password"
            placeholder="确认临时密码"
            value={confirmTemporaryPassword}
            onChange={(event) => setConfirmTemporaryPassword(event.target.value)}
            required
            minLength={8}
          />
          <div className={styles.passwordResetActions}>
            <button
              className={styles.buttonSecondary}
              type="button"
              onClick={() => {
                setPasswordTarget(null);
                setTemporaryPassword('');
                setConfirmTemporaryPassword('');
              }}
            >
              取消
            </button>
            <button className={styles.button} type="submit" disabled={isResettingPassword}>
              {isResettingPassword ? '重置中…' : '确认重置'}
            </button>
          </div>
        </form>
      ) : null}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>用户</th>
            <th>角色</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <div className={styles.userIdentity}>
                  <div className={styles.userNameRow}>
                    <span className={styles.userName}>{userDisplayName(user)}</span>
                    {isDeleted(user) ? <span className={styles.userDisabledTag}>已注销</span> : null}
                    {!isDeleted(user) && isDisabled(user) ? <span className={styles.userDisabledTag}>已停用</span> : null}
                    {!isDeleted(user) && user.mustChangePassword ? (
                      <span className={styles.userPasswordTag}>待修改密码</span>
                    ) : null}
                  </div>
                  <span className={styles.userEmail}>{user.email}</span>
                </div>
              </td>
              <td>
                <span className={ROLE_CLASS[user.role] ?? styles.roleMember}>
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </td>
              <td className={styles.mono}>
                {new Date(user.createdAt).toLocaleDateString('zh-CN')}
              </td>
              <td>
                <div className={styles.userActions}>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={!canManageRoles || !canManage(user, currentUser) || isDeleted(user)}
                    onClick={() => {
                      setPasswordTarget(user);
                      setTemporaryPassword('');
                      setConfirmTemporaryPassword('');
                      setNotice(null);
                    }}
                  >
                    重置密码
                  </button>
                  <button
                    className={isDisabled(user) ? styles.button : styles.buttonSecondary}
                    type="button"
                    disabled={!canManageRoles || !canManage(user, currentUser) || isDeleted(user)}
                    title={
                      isDeleted(user) ? '已注销用户无法操作' :
                      !canManageRoles ? '当前角色没有停用用户权限' :
                      isSelf(user, currentUser) ? '不能停用自己' :
                      user.role === 'SUPER_ADMIN' ? '超级管理员无法被停用' :
                      user.role === 'ADMIN' && currentUser.role !== 'SUPER_ADMIN' ? '只有超级管理员才能停用管理员' :
                      undefined
                    }
                    onClick={() => void toggleDisabled(user)}
                  >
                    {isDisabled(user) ? '启用用户' : '停用用户'}
                  </button>
                  <button
                    className={styles.buttonSecondary}
                    type="button"
                    disabled={!canManageRoles || !canManage(user, currentUser)}
                    title={
                      !canManageRoles ? '当前角色没有修改用户角色权限' :
                      isSelf(user, currentUser) ? '不能修改自己的角色' :
                      user.role === 'SUPER_ADMIN' ? '超级管理员无法被修改' :
                      user.role === 'ADMIN' && currentUser.role !== 'SUPER_ADMIN' ? '只有超级管理员才能管理其他管理员' :
                      undefined
                    }
                    onClick={() => void toggleRole(user)}
                  >
                    {user.role === 'MEMBER' ? '设为管理员' : '撤销管理员'}
                  </button>
                  <button
                    className={styles.buttonDanger}
                    type="button"
                    disabled={!canManageRoles || !canDelete(user, currentUser)}
                    title={
                      isDeleted(user) ? '该用户已被注销' :
                      !canManageRoles ? '当前角色没有注销用户权限' :
                      isSelf(user, currentUser) ? '不能注销自己' :
                      user.role === 'SUPER_ADMIN' ? '超级管理员无法被注销' :
                      user.role === 'ADMIN' && currentUser.role !== 'SUPER_ADMIN' ? '只有超级管理员才能注销管理员' :
                      undefined
                    }
                    onClick={() => void removeUser(user)}
                  >
                    注销用户
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {users.length === 0 ? (
            <tr>
              <td colSpan={4} className={styles.empty}>暂无用户</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
