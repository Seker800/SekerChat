import { useState } from 'react';
import { apiBaseUrl, fetchApi, parseResponse } from '../lib/api-core';
import styles from './PublicFileSharePage.module.css';

type UnlockedShare = { shareId: string; fileName: string; mimeType: string; size: string };
const PUBLIC_PASSWORD_PATTERN = /^[A-Za-z\d]{4,64}$/;

function readToken(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('t') ?? '';
}

function clearTokenFragment(): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

export function PublicFileSharePage() {
  const [token] = useState(readToken);
  const [password, setPassword] = useState('');
  const [downloadStarted, setDownloadStarted] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function unlock() {
    setBusy(true);
    setError('');
    try {
      const response = await fetchApi(
        `${apiBaseUrl}/public/file-shares/unlock`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        },
        30_000,
        { disableAuthRetry: true },
      );
      const unlockedShare = await parseResponse<UnlockedShare>(response);
      clearTokenFragment();
      const anchor = document.createElement('a');
      anchor.href = `${apiBaseUrl}/public/file-shares/${encodeURIComponent(unlockedShare.shareId)}/content`;
      anchor.download = unlockedShare.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setDownloadStarted(`${unlockedShare.fileName} 下载已开始`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '分享链接不可用或密码错误。');
    } finally {
      setBusy(false);
    }
  }

  const canUnlock = PUBLIC_PASSWORD_PATTERN.test(password) && Boolean(token);

  return (
    <main className={styles.shell}>
      <section className={styles.window} aria-label="文件分享下载">
        <header className={styles.titlebar}>
          <span className={styles.logo}>S</span>
          <strong>SekerChat 文件分享</strong>
        </header>
        <div className={styles.content}>
          <div className={styles.fileIcon}>⇩</div>
          <h1>输入分享密码</h1>
          <p>验证通过后将直接开始下载</p>
          <input
            aria-label="分享密码"
            value={password}
            minLength={4}
            maxLength={64}
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !busy && canUnlock) void unlock();
            }}
          />
          {error ? (
            <div className={styles.error} role="alert">
              {error}
            </div>
          ) : null}
          {downloadStarted ? (
            <div className={styles.success} role="status">
              {downloadStarted}
            </div>
          ) : null}
          <button
            className={styles.primary}
            type="button"
            disabled={busy || !canUnlock}
            onClick={() => void unlock()}
          >
            {busy ? '正在验证…' : '验证并下载'}
          </button>
        </div>
      </section>
    </main>
  );
}
