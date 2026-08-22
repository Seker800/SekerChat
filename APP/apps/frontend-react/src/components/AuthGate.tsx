import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './AuthGate.module.css';

interface LoginCopy {
  language: 'zh-CN' | 'en';
  title: string;
  description: string;
  loginTitle: string;
  registerTitle: string;
  email: string;
  password: string;
  displayName: string;
  login: string;
  register: string;
  waiting: string;
  switchToRegister: string;
  switchToLogin: string;
  passwordRules: string[];
}

const LOGIN_COPY: Record<'zh' | 'en', LoginCopy> = {
  zh: {
    language: 'zh-CN',
    title: 'SekerChat｜登录',
    description: '登录 SekerChat。',
    loginTitle: '登录 SekerChat',
    registerTitle: '注册 SekerChat',
    email: '邮箱',
    password: '密码',
    displayName: '显示名称（选填）',
    login: '登录',
    register: '注册',
    waiting: '请稍候...',
    switchToRegister: '没有账号？注册',
    switchToLogin: '已有账号？登录',
    passwordRules: [
      '至少 8 个字符',
      '至少包含一个大写字母',
      '至少包含一个小写字母',
      '至少包含一个数字',
    ],
  },
  en: {
    language: 'en',
    title: 'SekerChat | Sign in',
    description: 'Sign in to SekerChat.',
    loginTitle: 'Sign in to SekerChat',
    registerTitle: 'Create an account',
    email: 'Email',
    password: 'Password',
    displayName: 'Display name (optional)',
    login: 'Sign in',
    register: 'Register',
    waiting: 'Please wait...',
    switchToRegister: 'Need an account? Register',
    switchToLogin: 'Already have an account? Sign in',
    passwordRules: [
      'At least 8 characters',
      'One uppercase letter',
      'One lowercase letter',
      'One number',
    ],
  },
};

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
  const location = useLocation();
  const copy =
    location.pathname === '/en' || location.pathname.startsWith('/en/')
      ? LOGIN_COPY.en
      : LOGIN_COPY.zh;
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const passwordRules = [
    { key: 'minLength', label: copy.passwordRules[0], passed: password.length >= 8 },
    { key: 'uppercase', label: copy.passwordRules[1], passed: /[A-Z]/.test(password) },
    { key: 'lowercase', label: copy.passwordRules[2], passed: /[a-z]/.test(password) },
    { key: 'digit', label: copy.passwordRules[3], passed: /[0-9]/.test(password) },
  ];

  useEffect(() => {
    const origin = window.location.origin;
    const canonicalPath = copy.language === 'en' ? '/en' : '/';
    document.documentElement.lang = copy.language;
    document.title = copy.title;
    upsertHeadElement('meta[name="description"]', 'meta', {
      name: 'description',
      content: copy.description,
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
  }, [copy]);

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
        <h1 id="login-title">{tab === 'login' ? copy.loginTitle : copy.registerTitle}</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label>
            <span>{copy.email}</span>
            <input
              type="email"
              placeholder={copy.email}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            <span>{copy.password}</span>
            <input
              type="password"
              placeholder={copy.password}
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
              <span>{copy.displayName}</span>
              <input
                type="text"
                placeholder={copy.displayName}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
              />
            </label>
          ) : null}
          {props.passwordError ? <p className={styles.error}>{props.passwordError}</p> : null}
          <button type="submit" disabled={props.isPasswordSubmitting}>
            {props.isPasswordSubmitting
              ? copy.waiting
              : tab === 'login'
                ? copy.login
                : copy.register}
          </button>
        </form>
        <div className={styles.formFooter}>
          <button type="button" onClick={() => setTab(tab === 'login' ? 'register' : 'login')}>
            {tab === 'login' ? copy.switchToRegister : copy.switchToLogin}
          </button>
        </div>
      </section>
    </main>
  );
}
