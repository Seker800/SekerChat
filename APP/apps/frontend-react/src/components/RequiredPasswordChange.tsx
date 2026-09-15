import { FormEvent, useState } from 'react';
import { validateNewPassword } from '../lib/password-policy';
import styles from './RequiredPasswordChange.module.css';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      setError(t('requiredPassword.mismatch'));
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await onChangePassword(currentPassword, newPassword);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('requiredPassword.failed'));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.screen}>
      <section className={styles.card} aria-labelledby="required-password-title">
        <p className={styles.eyebrow}>{t('requiredPassword.eyebrow')}</p>
        <h1 id="required-password-title">{t('requiredPassword.title')}</h1>
        <p className={styles.description}>
          {t('requiredPassword.description', { email })}
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label>
            {t('requiredPassword.current')}
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            {t('requiredPassword.next')}
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
            {t('requiredPassword.confirm')}
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>
          <p className={styles.hint}>{t('requiredPassword.hint')}</p>
          {error ? <p className={styles.error}>{error}</p> : null}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('requiredPassword.submitting') : t('requiredPassword.submit')}
          </button>
        </form>

        <button className={styles.logout} type="button" onClick={onLogout}>
          {t('common.logout')}
        </button>
      </section>
    </main>
  );
}
