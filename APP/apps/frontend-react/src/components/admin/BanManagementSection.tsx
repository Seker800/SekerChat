import { useEffect, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { fetchBlacklist, unbanLoginRisk, type BanEntry } from '../../lib/bans-api';
import styles from './AdminPage.module.css';

interface BanManagementSectionProps {
  accessToken?: string;
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
}

export function BanManagementSection({ accessToken: providedAccessToken }: BanManagementSectionProps = {}) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [items, setItems] = useState<BanEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pageSize = 20;

  async function loadBlacklist(p: number, s: string) {
    setNotice(null);
    try {
      const result = await fetchBlacklist(accessToken, { page: p, pageSize, search: s || undefined });
      setItems(result.items);
      setTotal(result.total);
      setLoaded(true);
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '加载失败' });
      setLoaded(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchBlacklist(accessToken, { page: 1, pageSize })
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
        setLoaded(true);
      })
      .catch((e) => {
        if (cancelled) return;
        setNotice({ type: 'error', message: e instanceof Error ? e.message : '加载失败' });
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [accessToken]);

  function handleSearch() {
    setPage(1);
    loadBlacklist(1, search);
  }

  function handlePage(next: number) {
    setPage(next);
    loadBlacklist(next, search);
  }

  async function handleUnban(entry: BanEntry) {
    const note = window.prompt('解封原因（可选）:');
    if (note === null) return; // user cancelled
    setNotice(null);
    try {
      await unbanLoginRisk(accessToken, entry.id, note || undefined);
      setItems((prev) => prev.filter((item) => item.id !== entry.id));
      setTotal((prev) => prev - 1);
      setNotice({ type: 'success', message: `已解封 ${entry.email} (${entry.ip})` });
    } catch (e) {
      setNotice({ type: 'error', message: e instanceof Error ? e.message : '解封失败' });
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!loaded) {
    return null;
  }

  return (
    <section>
      <h3 className={styles.sectionTitle}>封禁</h3>

      {notice ? (
        <div className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}>
          {notice.message}
        </div>
      ) : null}

      <div className={styles.toolbar}>
        <input
          className={styles.textInput}
          placeholder="搜索邮箱或 IP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
        />
        <button className={styles.button} onClick={handleSearch}>搜索</button>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>邮箱</th>
            <th>IP</th>
            <th>失败次数</th>
            <th>最后失败时间</th>
            <th>锁定次数</th>
            <th>拉黑时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.email}</td>
              <td className={styles.mono}>{entry.ip}</td>
              <td>{entry.failedAttempts}</td>
              <td className={styles.mono}>{formatDateTime(entry.lastFailedAt)}</td>
              <td>{entry.lockoutCount}</td>
              <td className={styles.mono}>{formatDateTime(entry.blacklistedAt)}</td>
              <td>
                <div className={styles.rowActions}>
                  <button
                    className={styles.buttonSecondary}
                    onClick={() => handleUnban(entry)}
                  >
                    解封
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={7} className={styles.empty}>暂无黑名单记录</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {total > pageSize ? (
        <div className={styles.pagination}>
          <span>共 {total} 条记录</span>
          <div className={styles.pageBtns}>
            <button disabled={page <= 1} onClick={() => handlePage(page - 1)}>上一页</button>
            <span>第 {page} / {totalPages} 页</span>
            <button disabled={page >= totalPages} onClick={() => handlePage(page + 1)}>下一页</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
