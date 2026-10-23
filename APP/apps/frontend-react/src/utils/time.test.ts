import { describe, expect, it, vi } from 'vitest';
import { formatTimestamp } from './time';
import { formatDayDivider, isSameCalendarDay } from '../components/workspace/messagePaneUtils';
import type { MessageResponse } from '../lib/messages-files-api';

describe('date formatter reuse', () => {
  it('keeps locale output and reuses formatters across long histories', () => {
    const value = '2026-10-23T08:00:00Z';
    const expected = new Intl.DateTimeFormat('en', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
    const NativeFormatter = Intl.DateTimeFormat;
    const spy = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locale, options) {
      return new NativeFormatter(locale, options);
    });
    try {
      for (let i = 0; i < 500; i++) {
        expect(formatTimestamp(value, 'en')).toBe(expected);
        const message = { createdAt: value } as MessageResponse;
        expect(isSameCalendarDay(message, message, 'en')).toBe(true);
        formatDayDivider(value, 'en');
      }
      expect(spy.mock.calls.length).toBeLessThanOrEqual(3);
    } finally {
      spy.mockRestore();
    }
  });
});
