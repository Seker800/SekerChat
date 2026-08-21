import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './AuthGate.module.css';

interface HomeCopy {
  language: 'zh-CN' | 'en';
  title: string;
  description: string;
  heading: string;
  intro: string;
  sourceLink: string;
  loginLink: string;
  languageHref: string;
  languageLabel: string;
  facts: string[];
  featuresTitle: string;
  features: Array<{ title: string; body: string }>;
  stackTitle: string;
  stackBody: string;
  scenariosTitle: string;
  scenarios: string[];
  loginKicker: string;
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
  devNotice: string;
  passwordRules: string[];
}

const HOME_COPY: Record<'zh' | 'en', HomeCopy> = {
  zh: {
    language: 'zh-CN',
    title: 'SekerChat｜开源自托管团队协作与即时通讯',
    description:
      'SekerChat 是面向小团队的开源自托管协作工具，提供频道、私聊、文件、机器人和提醒，支持 Docker、PostgreSQL 与 S3 兼容存储。',
    heading: '自托管的小团队协作工具',
    intro:
      'SekerChat 把频道、私聊、文件、机器人和提醒放在同一个工作区。前端、后端、数据库和对象存储都可以运行在你自己的服务器上。',
    sourceLink: '查看源代码',
    loginLink: '登录此实例',
    languageHref: '/en',
    languageLabel: 'English',
    facts: ['AGPL-3.0', 'Docker', 'PostgreSQL', 'MinIO / S3', 'WebSocket'],
    featuresTitle: '主要功能',
    features: [
      { title: '频道与私聊', body: '按团队和话题组织讨论，支持实时消息、回复和阅读进度。' },
      { title: '文件管理', body: '图片和文件保存在自己的 S3 兼容对象存储中，并可创建受控分享。' },
      { title: '机器人与提醒', body: '后台任务负责机器人、提醒、缩略图和通知，失败后可以重试。' },
      {
        title: '完整的自托管栈',
        body: 'React、NestJS、PostgreSQL 和 MinIO 可通过 Docker 一起部署。',
      },
    ],
    stackTitle: '技术与部署',
    stackBody:
      '项目采用 TypeScript 单仓库，前端使用 React 和 Vite，后端使用 NestJS 与 Prisma。当前维护本机 Docker 开发环境和群晖 NAS 生产部署流程。',
    scenariosTitle: '适合的场景',
    scenarios: [
      '小型工作室和创业团队',
      '家庭或兴趣社群',
      '值班、运维和内部协作',
      '希望掌控数据的自托管用户',
    ],
    loginKicker: '当前实例',
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
    devNotice: '本地开发环境',
    passwordRules: [
      '至少 8 个字符',
      '至少包含一个大写字母',
      '至少包含一个小写字母',
      '至少包含一个数字',
    ],
  },
  en: {
    language: 'en',
    title: 'SekerChat | Open-source, self-hosted team chat',
    description:
      'SekerChat is an open-source, self-hosted collaboration tool for small teams, with channels, direct messages, files, bots, and reminders.',
    heading: 'Self-hosted collaboration for small teams',
    intro:
      'SekerChat keeps channels, direct messages, files, bots, and reminders in one workspace. The frontend, backend, database, and object storage can all run on your own server.',
    sourceLink: 'View source code',
    loginLink: 'Sign in to this instance',
    languageHref: '/',
    languageLabel: '中文',
    facts: ['AGPL-3.0', 'Docker', 'PostgreSQL', 'MinIO / S3', 'WebSocket'],
    featuresTitle: 'Features',
    features: [
      {
        title: 'Channels and direct messages',
        body: 'Organize discussions by team and topic with real-time messages, replies, and read progress.',
      },
      {
        title: 'File management',
        body: 'Keep images and files in your own S3-compatible object storage and create controlled shares.',
      },
      {
        title: 'Bots and reminders',
        body: 'Retryable background jobs handle bots, reminders, thumbnails, and notifications.',
      },
      {
        title: 'A complete self-hosted stack',
        body: 'Deploy React, NestJS, PostgreSQL, and MinIO together with Docker.',
      },
    ],
    stackTitle: 'Technology and deployment',
    stackBody:
      'The TypeScript monorepo uses React and Vite on the frontend, with NestJS and Prisma on the backend. It includes a local Docker development setup and a maintained production workflow for Synology NAS.',
    scenariosTitle: 'Good fit for',
    scenarios: [
      'Small studios and startups',
      'Families and interest groups',
      'Operations and internal coordination',
      'Self-hosters who want data ownership',
    ],
    loginKicker: 'This instance',
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
    devNotice: 'Local development',
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
  onOidcLogin: () => void;
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
      ? HOME_COPY.en
      : HOME_COPY.zh;
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
    upsertHeadElement('meta[property="og:title"]', 'meta', {
      property: 'og:title',
      content: copy.title,
    });
    upsertHeadElement('meta[property="og:description"]', 'meta', {
      property: 'og:description',
      content: copy.description,
    });
    upsertHeadElement('meta[property="og:url"]', 'meta', {
      property: 'og:url',
      content: `${origin}${canonicalPath}`,
    });
    upsertHeadElement('meta[property="og:locale"]', 'meta', {
      property: 'og:locale',
      content: copy.language === 'en' ? 'en_US' : 'zh_CN',
    });
    upsertHeadElement('meta[name="twitter:title"]', 'meta', {
      name: 'twitter:title',
      content: copy.title,
    });
    upsertHeadElement('meta[name="twitter:description"]', 'meta', {
      name: 'twitter:description',
      content: copy.description,
    });

    let data = document.head.querySelector<HTMLScriptElement>('#sekerchat-structured-data');
    if (!data) {
      data = document.createElement('script');
      data.id = 'sekerchat-structured-data';
      data.type = 'application/ld+json';
      document.head.appendChild(data);
    }
    data.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'SekerChat', url: `${origin}/`, inLanguage: ['zh-CN', 'en'] },
        {
          '@type': 'SoftwareApplication',
          name: 'SekerChat',
          applicationCategory: 'CommunicationApplication',
          operatingSystem: 'Web, Docker',
          description: copy.description,
          softwareVersion: __APP_VERSION__,
          isAccessibleForFree: true,
          codeRepository: 'https://github.com/Seker800/SekerChat',
          license: 'https://www.gnu.org/licenses/agpl-3.0.html',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
      ],
    });
  }, [copy]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (tab === 'login') void props.onPasswordLogin(email, password);
    else void props.onPasswordRegister(email, password, displayName || undefined);
  }

  return (
    <main className={styles.screen} data-testid="auth-panel">
      <header className={styles.header}>
        <a className={styles.brand} href={copy.language === 'en' ? '/en' : '/'}>
          SekerChat
        </a>
        <nav aria-label={copy.language === 'en' ? 'Main navigation' : '主导航'}>
          <a href="https://github.com/Seker800/SekerChat">GitHub</a>
          <a
            href={copy.languageHref}
            hrefLang={copy.language === 'en' ? 'zh-CN' : 'en'}
            aria-label={copy.language === 'en' ? '切换到中文首页' : 'Switch to English homepage'}
          >
            {copy.languageLabel}
          </a>
        </nav>
      </header>

      <div className={styles.page}>
        <section className={styles.intro}>
          <div className={styles.introCopy}>
            <p className={styles.kicker}>SekerChat</p>
            <h1>{copy.heading}</h1>
            <p className={styles.lead}>{copy.intro}</p>
            <div className={styles.actions}>
              <a className={styles.primaryLink} href="https://github.com/Seker800/SekerChat">
                {copy.sourceLink}
              </a>
              <a className={styles.textLink} href="#login">
                {copy.loginLink}
              </a>
            </div>
            <ul className={styles.facts}>
              {copy.facts.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>

          <section
            className={styles.loginCard}
            id="login"
            data-testid="auth-gate-panel"
            aria-labelledby="login-title"
          >
            <p className={styles.kicker}>{copy.loginKicker}</p>
            {import.meta.env.DEV ? (
              <div className={styles.devNotice} data-testid="auth-dev-notice">
                {copy.devNotice}
              </div>
            ) : null}
            <h2 id="login-title">{tab === 'login' ? copy.loginTitle : copy.registerTitle}</h2>
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
              <span data-testid="app-version">SekerChat v{__APP_VERSION__}</span>
              <button type="button" onClick={() => setTab(tab === 'login' ? 'register' : 'login')}>
                {tab === 'login' ? copy.switchToRegister : copy.switchToLogin}
              </button>
            </div>
          </section>
        </section>

        <section className={styles.features} aria-labelledby="features-title">
          <h2 id="features-title">{copy.featuresTitle}</h2>
          <div className={styles.featureList}>
            {copy.features.map((feature) => (
              <article key={feature.title}>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.details}>
          <div>
            <h2>{copy.stackTitle}</h2>
            <p>{copy.stackBody}</p>
          </div>
          <div>
            <h2>{copy.scenariosTitle}</h2>
            <ul>
              {copy.scenarios.map((scenario) => (
                <li key={scenario}>{scenario}</li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <span>© {new Date().getFullYear()} SekerChat</span>
        <span>
          AGPL-3.0-only · <a href="https://github.com/Seker800/SekerChat">GitHub</a>
        </span>
      </footer>
    </main>
  );
}
