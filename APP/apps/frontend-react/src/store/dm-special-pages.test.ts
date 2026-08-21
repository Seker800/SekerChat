import { describe, expect, it } from 'vitest';
import {
  DM_ALBUM_PAGE_ID,
  DM_ALBUM_ROUTE,
  DM_ATTENDANCE_PAGE_ID,
  DM_SPECIAL_PAGES,
  DM_SUBSCRIPTION_PAGE_ID,
  DM_SUBSCRIPTION_ROUTE,
  getDmSpecialPage,
  isDmSpecialPageId,
} from './dm-special-pages';

describe('dm special page registry', () => {
  it('registers attendance, articles and album in the intended order', () => {
    expect(isDmSpecialPageId(DM_ATTENDANCE_PAGE_ID)).toBe(true);
    expect(isDmSpecialPageId(DM_SUBSCRIPTION_PAGE_ID)).toBe(true);
    expect(isDmSpecialPageId(DM_ALBUM_PAGE_ID)).toBe(true);
    expect(DM_SPECIAL_PAGES.map((page) => page.label)).toEqual(['出勤', '文章', '相册']);
    expect(getDmSpecialPage(DM_SUBSCRIPTION_PAGE_ID)).toMatchObject({
      label: '文章',
      route: DM_SUBSCRIPTION_ROUTE,
    });
    expect(getDmSpecialPage(DM_ALBUM_PAGE_ID)).toMatchObject({
      label: '相册',
      route: DM_ALBUM_ROUTE,
    });
  });

  it('does not classify a real DM id as a special page', () => {
    expect(isDmSpecialPageId('dm-user-123')).toBe(false);
    expect(getDmSpecialPage('dm-user-123')).toBeNull();
  });
});
