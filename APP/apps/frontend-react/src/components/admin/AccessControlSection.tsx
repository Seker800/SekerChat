import { useEffect, useState } from 'react';
import { useResolvedAccessToken } from '../../auth/AuthContext';
import { fetchSystemConfig, updateSystemConfig } from '../../lib/system-config-api';
import styles from './AdminPage.module.css';

interface AccessControlSectionProps {
  accessToken?: string;
}

export function AccessControlSection({ accessToken: providedAccessToken }: AccessControlSectionProps = {}) {
  const accessToken = useResolvedAccessToken(providedAccessToken);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [whitelist, setWhitelist] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchSystemConfig(accessToken).then((cfg) => {
      if (cancelled) return;
      setRegistrationOpen(cfg.registrationOpen ?? false);
      setWhitelist(cfg.emailWhitelist ?? '');
      setLoaded(true);
    }).catch(() => {
      if (cancelled) return;
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [accessToken]);

  async function save() {
    setIsSaving(true);
    setNotice(null);
    try {
      await updateSystemConfig(accessToken, {
        registrationOpen: String(registrationOpen) as any,
        emailWhitelist: whitelist as any,
      });
      setNotice({ type: 'success', message: '已保存' });
    } catch {
      setNotice({ type: 'error', message: '保存失败，请重试' });
    } finally {
      setIsSaving(false);
    }
  }

  function toggleRegistration() {
    setRegistrationOpen((prev) => !prev);
  }

  if (!loaded) return null;

  return (
    <section>
      <h3 className={styles.sectionTitle}>访问控制</h3>

      <div className={styles.inlineField}>
        <label>开放注册</label>
        <button
          type="button"
          className={registrationOpen ? styles.toggleOn : styles.toggleOff}
          onClick={toggleRegistration}
        >
          <span className={registrationOpen ? styles.toggleKnobOn : styles.toggleKnobOff} />
        </button>
        <span className={styles.toggleLabel}>{registrationOpen ? '已开启' : '已关闭'}</span>
      </div>

      <div className={styles.inlineFieldTop}>
        <label>邮箱白名单</label>
        <div className={styles.fieldStack}>
          <textarea
            className={styles.textarea}
            rows={4}
            placeholder="每行一个邮箱，或用逗号分隔&#10;例如：&#10;admin@example.com&#10;user@example.com"
            value={whitelist}
            onChange={(e) => setWhitelist(e.target.value)}
          />
          <p className={styles.fieldHint}>留空不限制；支持逗号和换行。</p>
        </div>
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
