import { useEffect, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { fetchStorageStats, fetchSystemConfig, updateSystemConfig, type StorageStats } from '../../lib/system-config-api';
import styles from './AdminPage.module.css';

const GB_TO_MB = 1024;
const MIN_ATTACHMENT_GB = 1;
const MAX_ATTACHMENT_GB = 1024;
const MAX_SUBSCRIPTION_ATTACHMENT_GB = 10;

function bigintDiv(raw: string | undefined, divisor: bigint): number {
  if (!raw) return 0;
  try {
    const n = BigInt(raw);
    return Number(n / divisor) + Number(n % divisor) / Number(divisor);
  } catch {
    return 0;
  }
}

interface RetentionDraft {
  chatAttachmentMaxGB: number;
  subscriptionAttachmentMaxGB: number;
  textRetentionDays: number;
  imageRetentionDays: number;
  imageRetentionSizeGB: number;
  fileRetentionDays: number;
  fileRetentionSizeGB: number;
  schedule: 'daily' | 'weekly' | 'manual';
}

const EMPTY_DRAFT: RetentionDraft = {
  chatAttachmentMaxGB: 10,
  subscriptionAttachmentMaxGB: 5,
  textRetentionDays: 0,
  imageRetentionDays: 0,
  imageRetentionSizeGB: 0,
  fileRetentionDays: 0,
  fileRetentionSizeGB: 0,
  schedule: 'daily',
};

const SCHEDULE_LABELS: Record<RetentionDraft['schedule'], string> = {
  daily: '每天 03:00',
  weekly: '每周日 03:00',
  manual: '手动（不自动清理）',
};

/* ── tiny helpers ── */

function bytesGB(raw: string | undefined): number {
  return bigintDiv(raw, 1024n * 1024n * 1024n);
}

function pct(used: number, limit: number): string {
  if (limit <= 0) return '';
  const v = Math.min(100, (used / limit) * 100);
  return v < 0.1 ? '<0.1%' : `${v.toFixed(1)}%`;
}

/* ── component ── */

export function MessageRetentionSection({ accessToken: providedAccessToken }: { accessToken?: string } = {}) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [draft, setDraft] = useState<RetentionDraft>(EMPTY_DRAFT);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError('');
      setNotice(null);
      try {
        const [cfg, s] = await Promise.all([
          fetchSystemConfig(accessToken),
          fetchStorageStats(accessToken).catch(() => null),
        ]);
        if (cancelled) return;
        setDraft({
          chatAttachmentMaxGB: Math.max(1, Math.round(cfg.chatAttachmentMaxMB / GB_TO_MB)),
          subscriptionAttachmentMaxGB: Math.max(1, Math.round(cfg.subscriptionAttachmentMaxMB / GB_TO_MB)),
          textRetentionDays: cfg.textRetentionDays,
          imageRetentionDays: cfg.imageRetentionDays,
          imageRetentionSizeGB: cfg.imageRetentionSizeGB,
          fileRetentionDays: cfg.fileRetentionDays,
          fileRetentionSizeGB: cfg.fileRetentionSizeGB,
          schedule: cfg.retentionSchedule,
        });
        setStats(s);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '读取失败');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [accessToken]);

  function setInt<K extends keyof RetentionDraft>(key: K, raw: string) {
    setDraft((c) => ({ ...c, [key]: Math.max(0, Math.round(Number(raw)) || 0) }));
  }

  async function save() {
    setIsSaving(true);
    setNotice(null);
    try {
      await updateSystemConfig(accessToken, {
        chatAttachmentMaxMB: draft.chatAttachmentMaxGB * GB_TO_MB,
        subscriptionAttachmentMaxMB: draft.subscriptionAttachmentMaxGB * GB_TO_MB,
        textRetentionDays: draft.textRetentionDays,
        imageRetentionDays: draft.imageRetentionDays,
        imageRetentionSizeGB: draft.imageRetentionSizeGB,
        fileRetentionDays: draft.fileRetentionDays,
        fileRetentionSizeGB: draft.fileRetentionSizeGB,
        retentionSchedule: draft.schedule,
      });
      setNotice({ type: 'success', message: '已保存' });
    } catch {
      setNotice({ type: 'error', message: '保存失败，请重试' });
    } finally {
      setIsSaving(false);
    }
  }

  const disabled = isLoading || Boolean(loadError);

  const imageGB = bytesGB(stats?.imageStorageBytes);
  const fileGB = bytesGB(stats?.fileStorageBytes);
  const artifactGB = bytesGB(stats?.artifactStorageBytes);

  return (
    <section>
      <h3 className={styles.sectionTitle}>消息与附件</h3>

      {/* ── loading / error ── */}
      {isLoading ? <div className={styles.fieldHint}>读取中…</div> : null}
      {!isLoading && loadError ? (
        <div className={styles.noticeError}>
          {loadError}
          {' '}
          <button className={styles.buttonSecondary} type="button" onClick={() => window.location.reload()}>
            重试
          </button>
        </div>
      ) : null}

      {/* ── 当前用量 ── */}
      {stats && !isLoading ? (
        <div className={styles.storageStatsRow}>
          <span>文字 <strong style={{ color: 'var(--text-strong)' }}>{stats.textMessageCount.toLocaleString()}</strong> 条</span>
          <span>图片 <strong style={{ color: 'var(--text-strong)' }}>{stats.imageCount.toLocaleString()}</strong> 个 / {imageGB.toFixed(2)} GB</span>
          <span>文件 <strong style={{ color: 'var(--text-strong)' }}>{stats.fileCount.toLocaleString()}</strong> 个 / {fileGB.toFixed(2)} GB</span>
          <span>产出文件 <strong style={{ color: 'var(--text-strong)' }}>{stats.artifactCount.toLocaleString()}</strong> 个 / {artifactGB.toFixed(2)} GB</span>
          <span>合计 {bytesGB(stats.totalStorageBytes).toFixed(2)} GB</span>
        </div>
      ) : null}

      <div className={styles.separator} />

      {/* ── 上传限制 ── */}
      <div className={styles.inlineField}>
        <label htmlFor="chat-attachment-max-gb">聊天单附件上限</label>
        <input
          id="chat-attachment-max-gb"
          type="number"
          min={MIN_ATTACHMENT_GB}
          max={MAX_ATTACHMENT_GB}
          value={draft.chatAttachmentMaxGB}
          disabled={disabled || isSaving}
          onChange={(e) => {
            const v = Math.min(MAX_ATTACHMENT_GB, Math.max(1, Math.round(Number(e.target.value)) || MIN_ATTACHMENT_GB));
            setDraft((c) => ({ ...c, chatAttachmentMaxGB: v }));
          }}
        />
        <span className={styles.fieldHint}>GB</span>
        <span className={styles.fieldHint}>{MIN_ATTACHMENT_GB}–{MAX_ATTACHMENT_GB}</span>
      </div>

      <div className={styles.inlineField}>
        <label htmlFor="subscription-attachment-max-gb">文章单附件上限</label>
        <input
          id="subscription-attachment-max-gb"
          type="number"
          min={MIN_ATTACHMENT_GB}
          max={MAX_SUBSCRIPTION_ATTACHMENT_GB}
          value={draft.subscriptionAttachmentMaxGB}
          disabled={disabled || isSaving}
          onChange={(e) => {
            const v = Math.min(
              MAX_SUBSCRIPTION_ATTACHMENT_GB,
              Math.max(1, Math.round(Number(e.target.value)) || MIN_ATTACHMENT_GB),
            );
            setDraft((c) => ({ ...c, subscriptionAttachmentMaxGB: v }));
          }}
        />
        <span className={styles.fieldHint}>GB</span>
        <span className={styles.fieldHint}>{MIN_ATTACHMENT_GB}–{MAX_SUBSCRIPTION_ATTACHMENT_GB}</span>
      </div>

      <div className={styles.separator} />

      {/* ── 清理规则 ── */}
      <div className={styles.inlineField}>
        <label htmlFor="retention-schedule">清理周期</label>
        <select
          id="retention-schedule"
          value={draft.schedule}
          disabled={disabled || isSaving}
          onChange={(e) => setDraft((c) => ({ ...c, schedule: e.target.value as RetentionDraft['schedule'] }))}
        >
          <option value="daily">{SCHEDULE_LABELS.daily}</option>
          <option value="weekly">{SCHEDULE_LABELS.weekly}</option>
          <option value="manual">{SCHEDULE_LABELS.manual}</option>
        </select>
      </div>

      <div className={styles.inlineField}>
        <label htmlFor="text-retention-days">文字</label>
        <input id="text-retention-days" type="number" min={0} max={3650} value={draft.textRetentionDays} disabled={disabled || isSaving} onChange={(e) => setInt('textRetentionDays', e.target.value)} />
        <span className={styles.fieldHint}>天</span>
        {draft.textRetentionDays === 0 ? <span className={styles.fieldHint}>永久</span> : null}
      </div>

      <div className={styles.inlineField}>
        <label htmlFor="image-retention-days">图片</label>
        <input id="image-retention-days" type="number" min={0} max={3650} value={draft.imageRetentionDays} disabled={disabled || isSaving} onChange={(e) => setInt('imageRetentionDays', e.target.value)} />
        <span className={styles.fieldHint}>天</span>
        {draft.imageRetentionDays === 0 ? <span className={styles.fieldHint}>永久</span> : null}
        <span className={styles.fieldHint}>或容量达</span>
        <input id="image-retention-size-gb" type="number" min={0} max={1000} value={draft.imageRetentionSizeGB} disabled={disabled || isSaving} onChange={(e) => setInt('imageRetentionSizeGB', e.target.value)} />
        <span className={styles.fieldHint}>GB 时清理</span>
        {draft.imageRetentionSizeGB > 0 && stats ? (
          <span className={styles.fieldHint}>
            当前 {imageGB.toFixed(1)} GB（{pct(imageGB, draft.imageRetentionSizeGB)}）
          </span>
        ) : null}
      </div>

      <div className={styles.inlineField}>
        <label htmlFor="file-retention-days">文件</label>
        <input id="file-retention-days" type="number" min={0} max={3650} value={draft.fileRetentionDays} disabled={disabled || isSaving} onChange={(e) => setInt('fileRetentionDays', e.target.value)} />
        <span className={styles.fieldHint}>天</span>
        {draft.fileRetentionDays === 0 ? <span className={styles.fieldHint}>永久</span> : null}
        <span className={styles.fieldHint}>或容量达</span>
        <input id="file-retention-size-gb" type="number" min={0} max={1000} value={draft.fileRetentionSizeGB} disabled={disabled || isSaving} onChange={(e) => setInt('fileRetentionSizeGB', e.target.value)} />
        <span className={styles.fieldHint}>GB 时清理</span>
        {draft.fileRetentionSizeGB > 0 && stats ? (
          <span className={styles.fieldHint}>
            当前 {fileGB.toFixed(1)} GB（{pct(fileGB, draft.fileRetentionSizeGB)}）
          </span>
        ) : null}
      </div>

      <div className={styles.separator} />

      {/* ── action ── */}
      <div className={styles.inlineField}>
        <label />
        <button className={styles.button} type="button" disabled={isSaving || disabled} onClick={save}>
          {isSaving ? '保存中…' : '保存'}
        </button>
        {notice ? (
          <span className={notice.type === 'success' ? styles.fieldHint : styles.noticeError} style={notice.type === 'error' ? { marginTop: 0 } : undefined}>
            {notice.message}
          </span>
        ) : null}
      </div>
    </section>
  );
}
