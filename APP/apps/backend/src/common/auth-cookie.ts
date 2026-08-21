import type { Request } from 'express';

export const ACCESS_COOKIE_NAME = 'sekerchat_access';
export const REFRESH_COOKIE_NAME = 'sekerchat_refresh';

export function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }

  return Object.fromEntries(
    header
      .split(';')
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) {
          return [part.trim(), ''];
        }
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        return [key, decodeURIComponent(value)];
      })
      .filter(([key]) => Boolean(key)),
  );
}

export function readCookie(request: Request, name: string): string | undefined {
  const value = parseCookieHeader(request.headers.cookie)[name];
  return value?.trim() || undefined;
}
