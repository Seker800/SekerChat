import { describe, expect, it } from 'vitest';
import { canManageAttachmentShare } from './fileShareCapabilities';

const group = { archivedAt: null };

describe('canManageAttachmentShare', () => {
  it('allows sharing in an active channel without user or uploader checks', () => {
    expect(canManageAttachmentShare(group)).toBe(true);
  });

  it('rejects missing and archived channel context', () => {
    expect(canManageAttachmentShare(null)).toBe(false);
    expect(canManageAttachmentShare({ ...group, archivedAt: '2026-08-10T10:00:00.000Z' })).toBe(
      false,
    );
  });
});
