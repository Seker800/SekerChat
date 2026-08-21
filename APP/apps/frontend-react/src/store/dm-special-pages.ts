export const DM_ATTENDANCE_PAGE_ID = '__dm_attendance__';
export const DM_SUBSCRIPTION_PAGE_ID = '__dm_subscription__';
export const DM_ALBUM_PAGE_ID = '__dm_album__';

export const DM_ATTENDANCE_ROUTE = `/dm/${DM_ATTENDANCE_PAGE_ID}`;
export const DM_SUBSCRIPTION_ROUTE = `/dm/${DM_SUBSCRIPTION_PAGE_ID}`;
export const DM_ALBUM_ROUTE = `/dm/${DM_ALBUM_PAGE_ID}`;

export interface DmSpecialPageDefinition {
  id: string;
  label: string;
  description: string;
  route: string;
}

export const DM_SPECIAL_PAGES: readonly DmSpecialPageDefinition[] = [
  {
    id: DM_ATTENDANCE_PAGE_ID,
    label: '出勤',
    description: '出勤分析',
    route: DM_ATTENDANCE_ROUTE,
  },
  {
    id: DM_SUBSCRIPTION_PAGE_ID,
    label: '文章',
    description: '文章发布与确认已读',
    route: DM_SUBSCRIPTION_ROUTE,
  },
  {
    id: DM_ALBUM_PAGE_ID,
    label: '相册',
    description: '共享照片',
    route: DM_ALBUM_ROUTE,
  },
] as const;

export function getDmSpecialPage(pageId: string): DmSpecialPageDefinition | null {
  return DM_SPECIAL_PAGES.find((page) => page.id === pageId) ?? null;
}

export function isDmSpecialPageId(pageId: string): boolean {
  return getDmSpecialPage(pageId) !== null;
}
