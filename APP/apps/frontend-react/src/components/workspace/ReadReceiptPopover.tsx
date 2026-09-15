import { Avatar } from '../shared/Avatar';
import type { MessageResponse } from '../../lib/messages-files-api';
import { userDisplayName } from '../../lib/users-api';
import { useTranslation } from 'react-i18next';
import styles from './MessagePane.module.css';

interface ReadReceiptPopoverProps {
  receipt: NonNullable<MessageResponse['readReceipt']>;
  accessToken?: string;
}

export function receiptMemberLabel(member: {
  displayName: string | null;
  email: string;
}): string {
  return userDisplayName(member);
}

export function readReceiptAriaLabel(
  receipt: NonNullable<MessageResponse['readReceipt']>,
  language: 'zh-CN' | 'en' = 'zh-CN',
): string {
  return language === 'en'
    ? `Read receipt: ${receipt.readCount}/${receipt.totalRecipients}`
    : `已读回执：${receipt.readCount}/${receipt.totalRecipients}`;
}

export function isReadReceiptComplete(receipt: NonNullable<MessageResponse['readReceipt']>): boolean {
  return receipt.totalRecipients > 0 && receipt.readCount >= receipt.totalRecipients;
}

export function ReadReceiptPopover({ receipt, accessToken }: ReadReceiptPopoverProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.receiptPopover} role="dialog" aria-label={t('messages.receiptTitle')}>
      <section className={styles.receiptSection}>
        <div className={styles.receiptHeading}>
          {t('messages.receiptRead', { count: receipt.readCount })}
        </div>
        {receipt.readBy.length ? (
          <ul className={styles.receiptList}>
            {receipt.readBy.map((member) => (
              <li key={`read-${member.userId}`} className={styles.receiptListItem}>
                <Avatar avatarUrl={member.avatarUrl} name={receiptMemberLabel(member)} size={24} accessToken={accessToken} />
                <span>{receiptMemberLabel(member)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.receiptEmpty}>{t('messages.receiptNobodyRead')}</div>
        )}
      </section>
      <section className={styles.receiptSection}>
        <div className={styles.receiptHeading}>
          {t('messages.receiptUnread', { count: receipt.unreadCount })}
        </div>
        {receipt.unreadBy.length ? (
          <ul className={styles.receiptList}>
            {receipt.unreadBy.map((member) => (
              <li key={`unread-${member.userId}`} className={styles.receiptListItem}>
                <Avatar avatarUrl={member.avatarUrl} name={receiptMemberLabel(member)} size={24} accessToken={accessToken} />
                <span>{receiptMemberLabel(member)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.receiptEmpty}>{t('messages.receiptEveryoneRead')}</div>
        )}
      </section>
    </div>
  );
}
