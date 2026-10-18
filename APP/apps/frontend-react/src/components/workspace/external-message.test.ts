import { describe, expect, it } from 'vitest';
import {
  isCompactWithPrevious,
  renderExternalMessage,
  messageDisplayTime,
  isSameCalendarDay,
} from './messagePaneUtils';

describe('external message presentation', () => {
  it('uses original QQ time for history timestamps, day dividers and compact grouping', () => {
    const first = {
      source: 'qq',
      sourceOccurredAt: '2026-10-15T12:00:00Z',
      createdAt: '2026-10-18T00:00:00Z',
      senderId: 'bridge',
      externalAuthorId: 'a',
      sender: { displayName: 'QQ 群友' },
      type: 'text',
    };
    const later = { ...first, sourceOccurredAt: '2026-10-16T12:00:00Z' };
    expect(messageDisplayTime(first as never)).toBe(first.sourceOccurredAt);
    expect(messageDisplayTime({ ...first, source: undefined } as never)).toBe(first.createdAt);
    expect(isSameCalendarDay(first as never, later as never)).toBe(false);
    expect(isCompactWithPrevious(first as never, later as never)).toBe(false);
    expect(isCompactWithPrevious(later as never, first as never)).toBe(false);
  });
  it('renders external text literally without interpreting Markdown or HTML', () => {
    const html = renderExternalMessage('**QQ 原文**\n<img src=x onerror=alert(1)>');
    expect(html).toContain('**QQ 原文**<br>');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });
  it('does not compact two different QQ authors who share the same integration actor', () => {
    const first = {
      senderId: 'bridge',
      externalAuthorId: 'a',
      sender: { displayName: 'QQ 群友', avatarUrl: null },
      type: 'text',
      createdAt: '2026-10-18T00:00:00Z',
    };
    const second = { ...first, externalAuthorId: 'b' };
    expect(isCompactWithPrevious(first as never, second as never)).toBe(false);
    expect(isCompactWithPrevious(first as never, first as never)).toBe(true);
    expect(
      isCompactWithPrevious(
        first as never,
        { ...first, sender: { ...first.sender, displayName: '新的群名片' } } as never,
      ),
    ).toBe(false);
  });
});
