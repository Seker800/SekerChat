import { FormEvent, useState } from 'react';
import { validateNewPassword } from '../lib/password-policy';
import styles from './RequiredPasswordChange.module.css';

interface RequiredPasswordChangeProps {
  email: string;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onLogout: () => void;
}

export function RequiredPasswordChange({
  email,
  onChangePassword,
  onLogout,
}: RequiredPasswordChangeProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const policyError = validateNewPassword(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onChangePassword(currentPassword, newPassword);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '修改密码失败。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.screen}>
      <section className={styles.card} aria-labelledby="required-password-title">
        <p className={styles.eyebrow}>安全验证</p>
        <h1 id="required-password-title">请先修改临时密码</h1>
        <p className={styles.description}>
          管理员已重置账号 <strong>{email}</strong> 的密码。设置新密码后才能继续使用 SekerChat。
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            当前临时密码
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            新密码
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <label>
            确认新密码
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <p className={styles.hint}>至少 8 位，包含大写字母、小写字母和数字。</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '正在修改…' : '修改密码并继续'}
          </button>
        </form>

        <button className={styles.logout} type="button" onClick={onLogout}>
          退出登录
        </button>
      </section>
    </main>
  );
}
