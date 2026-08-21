import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { ACCESS_COOKIE_NAME, readCookie, REFRESH_COOKIE_NAME } from '../common/auth-cookie';
import type { AuthSession } from './auth-session.types';
import { enforceTrustedOriginForCookieAuth } from './request-origin';
import { parseDurationToMilliseconds } from './session-duration';

@Injectable()
export class BrowserSessionService {
  constructor(private readonly configService: ConfigService) {}

  writeSession(response: Response, session: AuthSession): void {
    const secure = this.appBaseUrl.startsWith('https');
    response.cookie(ACCESS_COOKIE_NAME, session.accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/',
      maxAge: parseDurationToMilliseconds(this.configService.getOrThrow<string>('JWT_ACCESS_TTL')),
    });
    response.cookie(REFRESH_COOKIE_NAME, session.refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure,
      path: '/api/auth',
      maxAge: parseDurationToMilliseconds(this.configService.getOrThrow<string>('JWT_REFRESH_TTL')),
    });
  }

  clearSession(response: Response): void {
    const options = {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: this.appBaseUrl.startsWith('https'),
    };
    response.clearCookie(ACCESS_COOKIE_NAME, { ...options, path: '/' });
    response.clearCookie(REFRESH_COOKIE_NAME, { ...options, path: '/api/auth' });
  }

  resolveRefreshCookie(request: Request): string {
    const token = readCookie(request, REFRESH_COOKIE_NAME)?.trim();
    enforceTrustedOriginForCookieAuth(request, this.appBaseUrl, token);
    if (!token) {
      throw new UnauthorizedException('Missing refresh token.');
    }
    return token;
  }

  presentSession(session: AuthSession): { user: AuthSession['user'] } {
    return { user: session.user };
  }

  private get appBaseUrl(): string {
    return this.configService.getOrThrow<string>('APP_BASE_URL');
  }
}
