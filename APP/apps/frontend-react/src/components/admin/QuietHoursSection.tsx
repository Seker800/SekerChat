import { useEffect, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { fetchSystemConfig, updateSystemConfig } from '../../lib/system-config-api';
import styles from './AdminPage.module.css';

interface QuietHoursSectionProps {
  accessToken?: string;
}

const DAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const DEFAULTS = { dndOn1: '08:30', dndOff1: '12:00', dndOn2: '13:30', dndOff2: '18:00', dndDaysOfWeek: '1,2,3,4,5' };

export function QuietHoursSection({ accessToken: providedAccessToken }: QuietHoursSectionProps = {}) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [dndOn1, setDndOn1] = useState(DEFAULTS.dndOn1);
  const [dndOff1, setDndOff1] = useState(DEFAULTS.dndOff1);
  const [dndOn2, setDndOn2] = useState(DEFAULTS.dndOn2);
  const [dndOff2, setDndOff2] = useState(DEFAULTS.dndOff2);
  const [activeDays, setActiveDays] = useState(new Set<number>([1, 2, 3, 4, 5]));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSystemConfig(accessToken).then((cfg) => {
      if (cancelled) return;
      setDndOn1(cfg.dndOn1);
      setDndOff1(cfg.dndOff1);
      setDndOn2(cfg.dndOn2);
      setDndOff2(cfg.dndOff2);
      const days = (cfg.dndDaysOfWeek || DEFAULTS.dndDaysOfWeek)
        .split(',')
        .map(Number)
        .filter((n) => Number.isFinite(n) && n >= 0 && n <= 6);
      setActiveDays(new Set(days));
    }).catch(() => {
      if (cancelled) return;
    });
    return () => { cancelled = true; };
  }, [accessToken]);

  function toggleDay(day: number) {
    setActiveDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }

  async function save() {
    setIsSaving(true);
    setNotice(null);
    try {
      const dndDaysOfWeek = Array.from(activeDays).sort().join(',');
      await updateSystemConfig(accessToken, { dndOn1, dndOff1, dndOn2, dndOff2, dndDaysOfWeek });
      setNotice({ type: 'success', message: '已保存' });
    } catch {
      setNotice({ type: 'error', message: '保存失败，请重试' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section>
      <h3 className={styles.sectionTitle}>通知时段</h3>

      <div className={styles.inlineFieldSpaced}>
        <label>重复</label>
        <div className={styles.dayToggleGroup}>
          {DAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              className={activeDays.has(i) ? styles.dayToggleActive : styles.dayToggle}
              onClick={() => toggleDay(i)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.inlineField}>
        <label>开启通知一</label>
        <input
          className={styles.timeInput}
          type="time"
          value={dndOn1}
          onChange={(e) => setDndOn1(e.target.value)}
        />
      </div>
      <div className={styles.inlineField}>
        <label>关闭通知一</label>
        <input
          className={styles.timeInput}
          type="time"
          value={dndOff1}
          onChange={(e) => setDndOff1(e.target.value)}
        />
      </div>
      <div className={styles.inlineField}>
        <label>开启通知二</label>
        <input
          className={styles.timeInput}
          type="time"
          value={dndOn2}
          onChange={(e) => setDndOn2(e.target.value)}
        />
      </div>
      <div className={styles.inlineField}>
        <label>关闭通知二</label>
        <input
          className={styles.timeInput}
          type="time"
          value={dndOff2}
          onChange={(e) => setDndOff2(e.target.value)}
        />
      </div>

      <div className={styles.buttonRow}>
        <button className={styles.button} type="button" disabled={isSaving} onClick={save}>
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
      {notice ? (
        <div className={notice.type === 'success' ? styles.noticeSuccess : styles.noticeError}>
          {notice.message}
        </div>
      ) : null}
    </section>
  );
}
