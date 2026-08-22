import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './AuthGate.module.css';

interface LoginCopy {
  language: 'zh-CN' | 'en';
  title: string;
  description: string;
  loginTitle: string;
  email: string;
  password: string;
  login: string;
  waiting: string;
}

const LOGIN_COPY: Record<'zh' | 'en', LoginCopy> = {
  zh: {
    language: 'zh-CN',
    title: 'SekerChat｜登录',
    description: '登录 SekerChat。',
    loginTitle: '登录 SekerChat',
    email: '邮箱',
    password: '密码',
    login: '登录',
    waiting: '请稍候...',
  },
  en: {
    language: 'en',
    title: 'SekerChat | Sign in',
    description: 'Sign in to SekerChat.',
    loginTitle: 'Sign in to SekerChat',
    email: 'Email',
    password: 'Password',
    login: 'Sign in',
    waiting: 'Please wait...',
  },
};

interface AuthGateProps {
  passwordError: string;
  isPasswordSubmitting: boolean;
  onPasswordLogin: (email: string, password: string) => Promise<void>;
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
    void props.onPasswordLogin(email, password);
  }

  return (
    <main className={styles.screen} data-testid="auth-panel">
      <section
        className={styles.loginCard}
        data-testid="auth-gate-panel"
        aria-labelledby="login-title"
      >
        <h1 id="login-title">{copy.loginTitle}</h1>
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
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              autoComplete="current-password"
            />
          </label>
          {props.passwordError ? <p className={styles.error}>{props.passwordError}</p> : null}
          <button type="submit" disabled={props.isPasswordSubmitting}>
            {props.isPasswordSubmitting ? copy.waiting : copy.login}
          </button>
        </form>
      </section>
    </main>
  );
}
