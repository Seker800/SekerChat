import { useEffect, useState } from 'react';
import styles from './WorkspaceStartupScreen.module.css';

interface WorkspaceStartupScreenProps {
  message: string;
  messageDelayMs?: number;
}

export function WorkspaceStartupScreen({
  message,
  messageDelayMs = 500,
}: WorkspaceStartupScreenProps) {
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
      aria-label="SekerChat 工作区正在启动"
    >
      <section className={styles.serverRail} aria-label="server栏加载占位">
        <div className={styles.brand}>S</div>
        <div className={styles.serverItem} />
        <div className={styles.serverItem} />
        <div className={styles.serverItem} />
      </section>

      <section className={styles.channelRail} aria-label="频道栏加载占位">
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

      <section className={styles.messagePane} aria-label="消息栏加载占位">
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

      <section className={styles.infoRail} aria-label="信息栏加载占位">
        <div className={styles.infoHeader} />
        <div className={styles.infoCard} />
        <div className={styles.infoLine} />
        <div className={styles.infoLineShort} />
      </section>
    </main>
  );
}
