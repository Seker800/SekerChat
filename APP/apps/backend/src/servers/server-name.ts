export const DEFAULT_SERVER_NAME = '未分类';

export function normalizeServerName(name?: string): string {
  return name?.trim() || DEFAULT_SERVER_NAME;
}
