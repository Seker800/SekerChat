import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import styles from './AuthGate.module.css';

interface HomeCopy {
  language: 'zh-CN' | 'en';
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  lead: string;
  github: string;
  loginAnchor: string;
  languageLabel: string;
  languageHref: string;
  languageName: string;
  proof: string[];
  preview: {
    channels: string;
    general: string;
    handoff: string;
    files: string;
    online: string;
    author: string;
    message: string;
    reply: string;
    composer: string;
  };
  sectionEyebrow: string;
  sectionTitle: string;
  features: Array<{ title: string; body: string }>;
  audienceTitle: string;
  audienceBody: string;
  audienceItems: string[];
  loginEyebrow: string;
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
      'SekerChat 是面向小团队的开源自托管协作工作区，集频道、私聊、文件、机器人和提醒于一体，支持 Docker、PostgreSQL 与 S3 兼容存储。',
    eyebrow: '开源 · 自托管 · 数据自主',
    heading: '把团队沟通和文件，稳稳放在自己的服务器上。',
    lead: 'SekerChat 是面向小团队的实时协作工作区。频道、私聊、文件、机器人和提醒集中在一处，数据与运行环境始终由你掌控。',
    github: '查看 GitHub 项目',
    loginAnchor: '登录当前实例',
    languageLabel: 'Switch to English homepage',
    languageHref: '/en',
    languageName: 'English',
    proof: ['AGPL-3.0 开源', 'Docker 自托管', 'PostgreSQL + MinIO', '实时 WebSocket'],
    preview: {
      channels: '团队频道',
      general: '# 日常协作',
      handoff: '# 交接播报',
      files: '# 文件归档',
      online: '3 人在线',
      author: '林晓',
      message: '新版部署清单已更新，数据库迁移和回滚步骤都在同一份文档里。',
      reply: '收到，我来补充今晚的验证结果。',
      composer: '发送消息到 #日常协作',
    },
    sectionEyebrow: '为真实协作而设计',
    sectionTitle: '一个可落地、可维护的团队工作区',
    features: [
      {
        title: '沟通集中有序',
        body: '用服务器、频道和私聊组织讨论，支持实时消息、回复、成员状态与阅读进度。',
      },
      {
        title: '文件留在自己的存储',
        body: '通过 MinIO 或其他 S3 兼容对象存储管理图片和文件，并支持受控的外部分享。',
      },
      {
        title: '自动化不阻塞聊天',
        body: '机器人、提醒、缩略图和通知由可重试任务处理，让核心消息链路保持稳定。',
      },
      {
        title: '部署边界清晰',
        body: 'React、NestJS、PostgreSQL 与 MinIO 组成完整栈，适合 Docker 与群晖 NAS。',
      },
    ],
    audienceTitle: '适合谁？',
    audienceBody: '适合想摆脱分散工具、重视数据所有权，又希望保留现代协作体验的小团队。',
    audienceItems: [
      '工作室与创业团队',
      '家庭与兴趣社群',
      '内部运维与值班协作',
      '自托管与开源爱好者',
    ],
    loginEyebrow: '当前实例',
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
      'SekerChat is an open-source, self-hosted workspace for small teams, combining channels, direct messages, files, bots, and reminders with Docker deployment.',
    eyebrow: 'Open source · Self-hosted · Data ownership',
    heading: 'Team conversations and files, securely on your own server.',
    lead: 'SekerChat is a real-time collaboration workspace for small teams. Keep channels, direct messages, files, bots, and reminders together while you stay in control of the infrastructure and data.',
    github: 'View project on GitHub',
    loginAnchor: 'Sign in to this instance',
    languageLabel: '切换到中文首页',
    languageHref: '/',
    languageName: '中文',
    proof: [
      'AGPL-3.0 licensed',
      'Docker self-hosting',
      'PostgreSQL + MinIO',
      'Real-time WebSocket',
    ],
    preview: {
      channels: 'Team channels',
      general: '# daily-work',
      handoff: '# handoff',
      files: '# file-archive',
      online: '3 online',
      author: 'Alex Chen',
      message: 'The deployment checklist now includes database migration and rollback steps.',
      reply: "Got it — I will add tonight's verification results.",
      composer: 'Message #daily-work',
    },
    sectionEyebrow: 'Built for real collaboration',
    sectionTitle: 'A practical, maintainable team workspace',
    features: [
      {
        title: 'Organized conversations',
        body: 'Structure work with servers, channels, and direct messages, including replies, presence, and read progress.',
      },
      {
        title: 'Files in your own storage',
        body: 'Store images and documents in MinIO or another S3-compatible service, with controlled public sharing.',
      },
      {
        title: 'Reliable automation',
        body: 'Bots, reminders, thumbnails, and notifications run as retryable jobs without blocking core messaging.',
      },
      {
        title: 'A clear deployment model',
        body: 'React, NestJS, PostgreSQL, and MinIO form a complete stack for Docker and Synology NAS.',
      },
    ],
    audienceTitle: 'Who is it for?',
    audienceBody:
      'For small teams that want fewer scattered tools, full data ownership, and a modern collaboration experience.',
    audienceItems: [
      'Studios and startups',
      'Families and communities',
      'Operations and on-call teams',
      'Self-hosting enthusiasts',
    ],
    loginEyebrow: 'This instance',
    loginTitle: 'Sign in to SekerChat',
    registerTitle: 'Create a SekerChat account',
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
  const passwordRules = useMemo(
    () => [
      { key: 'minLength', label: copy.passwordRules[0], passed: password.length >= 8 },
      { key: 'uppercase', label: copy.passwordRules[1], passed: /[A-Z]/.test(password) },
      { key: 'lowercase', label: copy.passwordRules[2], passed: /[a-z]/.test(password) },
      { key: 'digit', label: copy.passwordRules[3], passed: /[0-9]/.test(password) },
    ],
    [copy.passwordRules, password],
  );

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
    upsertHeadElement('meta[property="og:image"]', 'meta', {
      property: 'og:image',
      content: `${origin}/og.png`,
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
    upsertHeadElement('meta[name="twitter:image"]', 'meta', {
      name: 'twitter:image',
      content: `${origin}/og.png`,
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

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (tab === 'login') void props.onPasswordLogin(email, password);
    else void props.onPasswordRegister(email, password, displayName || undefined);
  }

  return (
    <main className={styles.screen} data-testid="auth-panel">
      <header className={styles.siteHeader}>
        <a
          className={styles.brand}
          href={copy.language === 'en' ? '/en' : '/'}
          aria-label="SekerChat homepage"
        >
          <span className={styles.brandMark}>S</span>
          <span>SekerChat</span>
        </a>
        <nav
          className={styles.headerNav}
          aria-label={copy.language === 'en' ? 'Main navigation' : '主导航'}
        >
          <a href="https://github.com/Seker800/SekerChat" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a
            href={copy.languageHref}
            hrefLang={copy.language === 'en' ? 'zh-CN' : 'en'}
            aria-label={copy.languageLabel}
          >
            {copy.languageName}
          </a>
        </nav>
      </header>

      <div className={styles.pageShell}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{copy.eyebrow}</p>
            <h1>{copy.heading}</h1>
            <p className={styles.lead}>{copy.lead}</p>
            <div className={styles.heroActions}>
              <a
                className={styles.primaryLink}
                href="https://github.com/Seker800/SekerChat"
                target="_blank"
                rel="noreferrer"
              >
                {copy.github}
                <span aria-hidden="true">↗</span>
              </a>
              <a className={styles.secondaryLink} href="#login">
                {copy.loginAnchor}
              </a>
            </div>
            <ul
              className={styles.proofList}
              aria-label={copy.language === 'en' ? 'Project highlights' : '项目亮点'}
            >
              {copy.proof.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div
            className={styles.productPreview}
            aria-label={
              copy.language === 'en' ? 'SekerChat workspace preview' : 'SekerChat 工作区预览'
            }
          >
            <div className={styles.previewChrome}>
              <span />
              <span />
              <span />
              <b>sekerchat.local</b>
            </div>
            <div className={styles.previewShell}>
              <div className={styles.previewRail}>
                <div className={`${styles.previewRailItem} ${styles.previewRailItemActive}`}>S</div>
                <div className={styles.previewRailItem}>+</div>
              </div>
              <div className={styles.previewSidebar}>
                <div className={styles.previewSidebarHeader}>
                  <strong>SekerChat</strong>
                  <span>{copy.preview.channels}</span>
                </div>
                <div className={styles.previewChannelList}>
                  <div className={`${styles.previewChannel} ${styles.previewChannelActive}`}>
                    {copy.preview.general}
                  </div>
                  <div className={styles.previewChannel}>{copy.preview.handoff}</div>
                  <div className={styles.previewChannel}>{copy.preview.files}</div>
                </div>
              </div>
              <div className={styles.previewMain}>
                <div className={styles.previewTopbar}>
                  <strong>{copy.preview.general}</strong>
                  <span>{copy.preview.online}</span>
                </div>
                <div className={styles.previewMessageList}>
                  <div className={styles.previewMessage}>
                    <div className={styles.previewAvatar}>{copy.preview.author.slice(0, 1)}</div>
                    <div className={styles.previewBubble}>
                      <strong>{copy.preview.author}</strong>
                      <p>{copy.preview.message}</p>
                    </div>
                  </div>
                  <div className={styles.previewMessageCompact}>
                    <span />
                    <p>{copy.preview.reply}</p>
                  </div>
                </div>
                <div className={styles.previewComposer}>{copy.preview.composer}</div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.featuresSection} aria-labelledby="features-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{copy.sectionEyebrow}</p>
            <h2 id="features-title">{copy.sectionTitle}</h2>
          </div>
          <div className={styles.featureGrid}>
            {copy.features.map((feature, index) => (
              <article className={styles.featureCard} key={feature.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.bottomGrid}>
          <div className={styles.audienceCard}>
            <p className={styles.eyebrow}>SekerChat</p>
            <h2>{copy.audienceTitle}</h2>
            <p>{copy.audienceBody}</p>
            <ul>
              {copy.audienceItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <section
            className={styles.loginCard}
            id="login"
            data-testid="auth-gate-panel"
            aria-labelledby="login-title"
          >
            <p className={styles.eyebrow}>{copy.loginEyebrow}</p>
            {import.meta.env.DEV ? (
              <div className={styles.devNotice} data-testid="auth-dev-notice">
                {copy.devNotice}
              </div>
            ) : null}
            <h2 id="login-title">{tab === 'login' ? copy.loginTitle : copy.registerTitle}</h2>
            <form onSubmit={handleSubmit} className={styles.passwordForm}>
              <label>
                <span>{copy.email}</span>
                <input
                  className={styles.input}
                  type="email"
                  placeholder={copy.email}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                <span>{copy.password}</span>
                <input
                  className={styles.input}
                  type="password"
                  placeholder={copy.password}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (!passwordTouched && e.target.value.length > 0) setPasswordTouched(true);
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
                      className={`${styles.passwordRule} ${rule.passed ? styles.rulePassed : styles.ruleFailed}`}
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
                    className={styles.input}
                    type="text"
                    placeholder={copy.displayName}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    autoComplete="name"
                  />
                </label>
              ) : null}
              {props.passwordError ? (
                <p className={`${styles.status} ${styles.error}`}>{props.passwordError}</p>
              ) : null}
              <button className={styles.button} type="submit" disabled={props.isPasswordSubmitting}>
                {props.isPasswordSubmitting
                  ? copy.waiting
                  : tab === 'login'
                    ? copy.login
                    : copy.register}
              </button>
            </form>
            <div className={styles.footerMeta}>
              <p className={styles.version} data-testid="app-version">
                SekerChat v{__APP_VERSION__}
              </p>
              <button
                type="button"
                className={styles.modeSwitchButton}
                onClick={() => setTab(tab === 'login' ? 'register' : 'login')}
              >
                {tab === 'login' ? copy.switchToRegister : copy.switchToLogin}
              </button>
            </div>
          </section>
        </section>
      </div>
      <footer className={styles.siteFooter}>
        <span>© {new Date().getFullYear()} SekerChat</span>
        <span>
          AGPL-3.0-only · Open source on <a href="https://github.com/Seker800/SekerChat">GitHub</a>
        </span>
      </footer>
    </main>
  );
}
