import { FormEvent, useMemo, useState } from 'react';
import styles from './AuthGate.module.css';

// Temporarily hide the homepage product preview; keep the markup below so it
// can be restored without rebuilding the login layout from scratch.
const SHOW_AUTH_PREVIEW = false;

interface PasswordRule {
  key: string;
  label: string;
  check: (password: string) => boolean;
}

const PASSWORD_RULES: PasswordRule[] = [
  { key: 'minLength', label: '至少 8 个字符', check: (p) => p.length >= 8 },
  { key: 'uppercase', label: '至少包含一个大写字母', check: (p) => /[A-Z]/.test(p) },
  { key: 'lowercase', label: '至少包含一个小写字母', check: (p) => /[a-z]/.test(p) },
  { key: 'digit', label: '至少包含一个数字', check: (p) => /[0-9]/.test(p) },
];

interface AuthGateProps {
  passwordError: string;
  isPasswordSubmitting: boolean;
  // OIDC login flow is still wired for future use; the homepage entry is
  // intentionally hidden below while Synology SSO is not part of daily login.
  onOidcLogin: () => void;
  onPasswordLogin: (email: string, password: string) => Promise<void>;
  onPasswordRegister: (email: string, password: string, displayName?: string) => Promise<void>;
}

export function AuthGate(props: AuthGateProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);

  const passwordRulesResult = useMemo(() => {
    return PASSWORD_RULES.map((rule) => ({
      ...rule,
      passed: rule.check(password),
    }));
  }, [password]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (tab === 'login') {
      void props.onPasswordLogin(email, password);
    } else {
      void props.onPasswordRegister(email, password, displayName || undefined);
    }
  }

  function handlePasswordChange(value: string) {
    setPassword(value);
    if (!passwordTouched && value.length > 0) {
      setPasswordTouched(true);
    }
  }

  return (
    <section className={styles.screen} data-testid="auth-panel">
      <div
        className={`${styles.panel} ${SHOW_AUTH_PREVIEW ? '' : styles.panelPreviewHidden}`}
        data-testid="auth-gate-panel"
      >
        {SHOW_AUTH_PREVIEW ? (
          <div className={styles.preview} aria-hidden="true">
            <div className={styles.previewChrome}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.previewShell}>
              <div className={styles.previewRail}>
                <div className={styles.previewRailItem}>IM</div>
                <div className={styles.previewRailItem} />
                <div className={`${styles.previewRailItem} ${styles.previewRailItemActive}`} />
              </div>
              <div className={styles.previewSidebar}>
                <div className={styles.previewSidebarHeader}>
                  <strong>SekerChat</strong>
                  <span>团队频道</span>
                </div>
                <div className={styles.previewChannelList}>
                  <div className={`${styles.previewChannel} ${styles.previewChannelActive}`}># 当班确认</div>
                  <div className={styles.previewChannel}># 交接播报</div>
                  <div className={styles.previewChannel}># 文件归档</div>
                </div>
              </div>
              <div className={styles.previewMain}>
                <div className={styles.previewTopbar}>
                  <strong># 当班确认</strong>
                  <span>2 人在线</span>
                </div>
                <div className={styles.previewMessageList}>
                  <div className={styles.previewMessage}>
                    <div className={styles.previewAvatar}>值</div>
                    <div className={styles.previewBubble}>
                      <strong>值班同学</strong>
                      <p>18:00 前确认值班排班。</p>
                    </div>
                  </div>
                  <div className={styles.previewMessageCompact}>
                    <span />
                    <p>收到，我会在 17:30 前同步提醒机器人。</p>
                  </div>
                </div>
                <div className={styles.previewComposer}>发送消息到 #当班确认</div>
              </div>
            </div>
          </div>
        ) : null}
        <div className={styles.form}>
          <p className={styles.eyebrow}>Welcome back</p>
          {import.meta.env.DEV ? (
            <div className={styles.devNotice} data-testid="auth-dev-notice">
              本地开发环境
            </div>
          ) : null}
          <h1 className={styles.heading}>
            {tab === 'login' ? '登录 SekerChat' : '注册 SekerChat'}
          </h1>

          <form onSubmit={handleSubmit} className={styles.passwordForm}>
            <input
              className={styles.input}
              type="email"
              placeholder="邮箱"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              className={styles.input}
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              required
              minLength={8}
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
            />
            {tab === 'register' && passwordTouched ? (
              <div className={styles.passwordRules}>
                {passwordRulesResult.map((rule) => (
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
              <input
                className={styles.input}
                type="text"
                placeholder="显示名称（选填）"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
              />
            ) : null}
            {props.passwordError ? (
              <p className={`${styles.status} ${styles.error}`}>{props.passwordError}</p>
            ) : null}
            <button
              className={styles.button}
              type="submit"
              disabled={props.isPasswordSubmitting}
            >
              {props.isPasswordSubmitting
                ? '请稍候...'
                : tab === 'login'
                  ? '登录'
                  : '注册'}
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
              {tab === 'login' ? '注册' : '登录'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
