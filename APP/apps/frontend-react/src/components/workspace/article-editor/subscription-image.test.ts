import { describe, expect, it } from 'vitest';
import { getSubscriptionAttachmentId, normalizePastedImageFile } from './subscription-image';

describe('subscription image helpers', () => {
  it('accepts only stable subscription attachment URLs', () => {
    expect(getSubscriptionAttachmentId('attachment://attachment-1')).toBe('attachment-1');
    expect(getSubscriptionAttachmentId('https://example.com/tracker.png')).toBeNull();
    expect(getSubscriptionAttachmentId('data:image/png;base64,abc')).toBeNull();
  });

  it('gives unnamed clipboard images a useful extension without changing the bytes', () => {
    const clipboardFile = new File(['image'], 'image.png', { type: 'image/png' });
    const normalized = normalizePastedImageFile(clipboardFile, 42);

    expect(normalized.name).toBe('粘贴图片-42.png');
    expect(normalized.type).toBe('image/png');
    expect(normalized.size).toBe(clipboardFile.size);
  });
});
