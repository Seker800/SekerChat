export type FileShareStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'CHANNEL_ARCHIVED';

type FileShareState = {
  expiresAt: Date;
  revokedAt: Date | null;
  revokedReason: string | null;
  groupArchivedAt: Date | null;
};

export function resolveFileShareStatus(share: FileShareState, now = new Date()): FileShareStatus {
  if (share.groupArchivedAt) {
    return 'CHANNEL_ARCHIVED';
  }
  if (share.revokedAt) {
    return 'REVOKED';
  }
  if (share.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return 'ACTIVE';
}
