import { Avatar } from '../shared/Avatar';
import type { MessageResponse } from '../../lib/messages-files-api';
import { userDisplayName } from '../../lib/users-api';
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

export function readReceiptAriaLabel(receipt: NonNullable<MessageResponse['readReceipt']>): string {
  return `已读回执：${receipt.readCount}/${receipt.totalRecipients}`;
}

export function isReadReceiptComplete(receipt: NonNullable<MessageResponse['readReceipt']>): boolean {
  return receipt.totalRecipients > 0 && receipt.readCount >= receipt.totalRecipients;
}

export function ReadReceiptPopover({ receipt, accessToken }: ReadReceiptPopoverProps) {
  return (
    <div className={styles.receiptPopover} role="dialog" aria-label="已读回执">
      <section className={styles.receiptSection}>
        <div className={styles.receiptHeading}>已读 {receipt.readCount}</div>
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
          <div className={styles.receiptEmpty}>还没有人已读</div>
        )}
      </section>
      <section className={styles.receiptSection}>
        <div className={styles.receiptHeading}>未读 {receipt.unreadCount}</div>
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
          <div className={styles.receiptEmpty}>所有人都已读</div>
        )}
      </section>
    </div>
  );
}
