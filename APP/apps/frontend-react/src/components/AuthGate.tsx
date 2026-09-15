import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../i18n/LanguageProvider';
import type { AppLanguage } from '../i18n/language';
import styles from './AuthGate.module.css';

interface AuthGateProps {
  passwordError: string;
  isPasswordSubmitting: boolean;
  onPasswordLogin: (email: string, password: string) => Promise<void>;
  onPasswordRegister: (email: string, password: string, displayName?: string) => Promise<void>;
}

function upsertHeadElement(
  selector: string,
  tagName: 'meta' | 'link',
  attributes: Record<string, string>,
) {
  let element = document.head.querySelector<HTMLElement>(selector);
  if (!element) {
    element = document.createElement(tagName);
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element?.setAttribute(name, value));
}

export function AuthGate(props: AuthGateProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const passwordRules = [
    { key: 'minLength', label: t('auth.passwordRules.minLength'), passed: password.length >= 8 },
    { key: 'uppercase', label: t('auth.passwordRules.uppercase'), passed: /[A-Z]/.test(password) },
    { key: 'lowercase', label: t('auth.passwordRules.lowercase'), passed: /[a-z]/.test(password) },
    { key: 'digit', label: t('auth.passwordRules.digit'), passed: /[0-9]/.test(password) },
  ];

  useEffect(() => {
    const origin = window.location.origin;
    const canonicalPath = language === 'en' ? '/en' : '/';
    document.title = t('auth.title');
    upsertHeadElement('meta[name="description"]', 'meta', {
      name: 'description',
      content: t('auth.description'),
    });
    upsertHeadElement('link[rel="canonical"]', 'link', {
      rel: 'canonical',
      href: `${origin}${canonicalPath}`,
    });
    upsertHeadElement('link[rel="alternate"][hreflang="zh-CN"]', 'link', {
      rel: 'alternate',
      hreflang: 'zh-CN',
      href: `${origin}/`,
    });
    upsertHeadElement('link[rel="alternate"][hreflang="en"]', 'link', {
      rel: 'alternate',
      hreflang: 'en',
      href: `${origin}/en`,
    });
    upsertHeadElement('link[rel="alternate"][hreflang="x-default"]', 'link', {
      rel: 'alternate',
      hreflang: 'x-default',
      href: `${origin}/`,
    });
  }, [language, t]);

  function handleLanguageChange(nextLanguage: AppLanguage) {
    setLanguage(nextLanguage);
    navigate(nextLanguage === 'en' ? '/en' : '/', { replace: true });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (tab === 'login') void props.onPasswordLogin(email, password);
    else void props.onPasswordRegister(email, password, displayName || undefined);
  }

  return (
    <main className={styles.screen} data-testid="auth-panel">
      <section
        className={styles.loginCard}
        data-testid="auth-gate-panel"
        aria-labelledby="login-title"
      >
        <div className={styles.cardHeader}>
          <h1 id="login-title">{tab === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}</h1>
          <label className={styles.languageControl}>
            <span>{t('language.label')}</span>
            <select
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value as AppLanguage)}
            >
              <option value="zh-CN">{t('language.chinese')}</option>
              <option value="en">{t('language.english')}</option>
            </select>
          </label>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label>
            <span>{t('auth.email')}</span>
            <input
              type="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            <span>{t('auth.password')}</span>
            <input
              type="password"
              placeholder={t('auth.password')}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                if (!passwordTouched && event.target.value) setPasswordTouched(true);
              }}
              required
              minLength={8}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {tab === 'register' && passwordTouched ? (
            <div className={styles.passwordRules}>
              {passwordRules.map((rule) => (
                <span
                  key={rule.key}
                  className={rule.passed ? styles.rulePassed : styles.ruleFailed}
                >
                  {rule.passed ? '✓' : '✗'} {rule.label}
                </span>
              ))}
            </div>
          ) : null}
          {tab === 'register' ? (
            <label>
              <span>{t('auth.displayName')}</span>
              <input
                type="text"
                placeholder={t('auth.displayName')}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
              />
            </label>
          ) : null}
          {props.passwordError ? <p className={styles.error}>{props.passwordError}</p> : null}
          <button type="submit" disabled={props.isPasswordSubmitting}>
            {props.isPasswordSubmitting
              ? t('auth.waiting')
              : tab === 'login'
                ? t('auth.login')
                : t('auth.register')}
          </button>
        </form>
        <div className={styles.formFooter}>
          <button type="button" onClick={() => setTab(tab === 'login' ? 'register' : 'login')}>
            {tab === 'login' ? t('auth.switchToRegister') : t('auth.switchToLogin')}
          </button>
        </div>
      </section>
    </main>
  );
}
