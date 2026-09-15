import { useEffect, useState } from 'react';
import styles from './WorkspaceStartupScreen.module.css';
import { useTranslation } from 'react-i18next';

interface WorkspaceStartupScreenProps {
  message: string;
  messageDelayMs?: number;
}

export function WorkspaceStartupScreen({
  message,
  messageDelayMs = 500,
}: WorkspaceStartupScreenProps) {
  const { t } = useTranslation();
  const [showMessage, setShowMessage] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowMessage(true);
    }, messageDelayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [messageDelayMs]);

  return (
    <main
      className={styles.shell}
      data-testid="workspace-startup-screen"
      aria-busy="true"
      aria-label={t('app.startupAria')}
    >
      <section className={styles.serverRail} aria-label={t('app.serverPlaceholder')}>
        <div className={styles.brand}>S</div>
        <div className={styles.serverItem} />
        <div className={styles.serverItem} />
        <div className={styles.serverItem} />
      </section>

      <section className={styles.channelRail} aria-label={t('app.channelPlaceholder')}>
        <div className={styles.channelHeader} />
        <div className={styles.channelBody}>
          <div className={styles.channelSection} />
          <div className={styles.channelItem} />
          <div className={styles.channelItemShort} />
          <div className={styles.channelSection} />
          <div className={styles.channelItem} />
        </div>
        <div className={styles.userPanel} />
      </section>

      <section className={styles.messagePane} aria-label={t('app.messagePlaceholder')}>
        <div className={styles.messageHeader} />
        <div className={styles.messageBody}>
          <div className={styles.messagePlaceholder}>
            <div className={styles.messageMark} />
            <div className={styles.messageLine} />
            <div className={styles.messageLineShort} />
          </div>
          <p className={styles.status} role="status" aria-live="polite">
            {showMessage ? message : null}
          </p>
        </div>
        <div className={styles.composer} />
      </section>

      <section className={styles.infoRail} aria-label={t('app.infoPlaceholder')}>
        <div className={styles.infoHeader} />
        <div className={styles.infoCard} />
        <div className={styles.infoLine} />
        <div className={styles.infoLineShort} />
      </section>
    </main>
  );
}
