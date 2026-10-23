import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { apiBaseUrl, fetchApi } from '../../lib/api-core';
import styles from './ChannelSidebar.module.css';
import reminderStyles from './NetworkReminder.module.css';

const NetworkReminderContext = createContext({ visible: false, dismiss: () => {} });

// Lives above workspace routes: navigation/remounting the sidebar must not undo
// acknowledgement. Logging out unmounts it; reload/login starts a fresh check.
export function NetworkReminderProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetchApi(
          `${apiBaseUrl}/network/status`,
          {
            signal: controller.signal,
            cache: 'no-store',
          },
          5_000,
        );
        if (!response.ok) {
          await response.body?.cancel();
          return;
        }
        const data: unknown = await response.json();
        if (
          !controller.signal.aborted &&
          data &&
          typeof data === 'object' &&
          'showWarning' in data &&
          data.showWarning === true
        )
          setVisible(true);
      } catch {
        // This advisory is optional; failed detection must not interrupt chat.
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <NetworkReminderContext.Provider value={{ visible, dismiss: () => setVisible(false) }}>
      {children}
    </NetworkReminderContext.Provider>
  );
}

export function useNetworkReminder() {
  return useContext(NetworkReminderContext);
}

export function NetworkReminder() {
  const { dismiss } = useNetworkReminder();
  const { t } = useTranslation();
  return (
    <div
      className={styles.attendanceCard}
      data-state="open"
      role="status"
      aria-label={t('networkReminder.title')}
    >
      <div className={styles.attendanceCardHeader}>
        <span className={styles.attendanceCardLabel}>{t('networkReminder.title')}</span>
      </div>
      <p className={reminderStyles.message}>{t('networkReminder.message')}</p>
      <button type="button" className={styles.attendanceCardAction} onClick={dismiss}>
        {t('networkReminder.acknowledge')}
      </button>
    </div>
  );
}
