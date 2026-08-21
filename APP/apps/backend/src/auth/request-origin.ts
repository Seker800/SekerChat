import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';

function resolveRequestOrigin(request: Request): string | null {
  const originHeader = request.headers.origin?.trim();
  if (originHeader) {
    return originHeader;
  }

  const refererHeader = request.headers.referer?.trim();
  if (!refererHeader) {
    return null;
  }

  try {
    return new URL(refererHeader).origin;
  } catch {
    return null;
  }
}

export function hasBearerAuthorization(request: Request): boolean {
  const authorization = request.headers.authorization?.trim() ?? '';
  if (!authorization.toLowerCase().startsWith('bearer ')) return false;
  const token = authorization.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}

function resolveAllowedOrigins(): string[] {
  const origins: string[] = [];
  const appBaseUrl = process.env.APP_BASE_URL?.trim();
  if (appBaseUrl) {
    try { origins.push(new URL(appBaseUrl).origin); } catch { /* skip */ }
  }
  const corsOrigins = process.env.CORS_ORIGINS?.trim();
  if (corsOrigins) {
    corsOrigins.split(',').forEach((o) => {
      const trimmed = o.trim();
      if (trimmed) {
        try { origins.push(new URL(trimmed).origin); } catch { /* skip */ }
      }
    });
  }
  return [...new Set(origins)];
}

export function enforceTrustedOriginForCookieAuth(
  request: Request,
  appBaseUrl: string,
  cookieValue: string | undefined,
): void {
  if (!cookieValue) {
    return;
  }

  // Dev mode skips origin checks so the app is reachable from LAN devices
  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  if (hasBearerAuthorization(request)) {
    return;
  }

  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return;
  }

  const requestOrigin = resolveRequestOrigin(request);
  if (!requestOrigin) {
    throw new ForbiddenException({
      message: 'Cookie-authenticated write requires an Origin or Referer header.',
      code: 'ORIGIN_REQUIRED',
    });
  }

  const allowedOrigins = resolveAllowedOrigins();
  if (allowedOrigins.length === 0) {
    try { allowedOrigins.push(new URL(appBaseUrl).origin); } catch { /* skip */ }
  }

  if (!allowedOrigins.includes(requestOrigin)) {
    throw new ForbiddenException({
      message: 'Cross-site cookie request rejected.',
      code: 'ORIGIN_REJECTED',
    });
  }
}
