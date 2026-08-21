import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { URL } from 'url';
import { AuthUserService } from '../auth/auth-user.service';
import { ReminderDeviceAuthService } from '../auth/reminder-device-auth.service';
import type { ReminderDevicePrincipal } from '../auth/reminder-device-auth.types';
import { ACCESS_COOKIE_NAME, parseCookieHeader } from '../common/auth-cookie';
import type { JwtPayload } from '../common/jwt-payload.interface';
import { PrismaService } from '../prisma/prisma.service';
import type { RealtimeClientContext } from './realtime-client.types';

@Injectable()
export class ConnectionAuthenticator {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authUserService: AuthUserService,
    private readonly reminderDeviceAuthService: ReminderDeviceAuthService,
  ) {}

  async authenticate(
    cookieHeader: string | undefined,
    hostHeader: string | undefined,
    requestUrl?: string,
  ): Promise<RealtimeClientContext> {
    const url = this.parseRequestUrl(hostHeader, requestUrl);
    const realtimeTicket = url.searchParams.get('ticket')?.trim();
    if (realtimeTicket) {
      return this.toReminderContext(
        await this.reminderDeviceAuthService.consumeRealtimeTicket(realtimeTicket),
      );
    }

    const accessToken = parseCookieHeader(cookieHeader)[ACCESS_COOKIE_NAME]?.trim();
    if (!accessToken) throw new Error('Missing realtime auth token.');

    const tokenPayload = await this.jwtService.verifyAsync<JwtPayload>(accessToken, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
    const payload = await this.authUserService.resolveValidatedUser(tokenPayload);
    if (payload.mustChangePassword) throw new Error('Password change required.');

    const user = await this.prismaService.user.findUnique({
      where: { id: payload.sub },
      select: { dndUntil: true },
    });
    return {
      userId: payload.sub,
      email: payload.email,
      displayName: payload.displayName ?? null,
      authKind: 'browser',
      isAlive: true,
      dndUntil: user?.dndUntil ?? null,
      heartbeatTimeout: null,
    };
  }

  async authenticateReminderDeviceToken(token: string): Promise<RealtimeClientContext> {
    return this.toReminderContext(
      await this.reminderDeviceAuthService.authenticateDeviceToken(token),
    );
  }

  private toReminderContext(principal: ReminderDevicePrincipal): RealtimeClientContext {
    return {
      userId: principal.userId,
      email: principal.email,
      displayName: principal.displayName,
      authKind: 'reminder',
      reminderDeviceTokenId: principal.deviceTokenId,
      isAlive: true,
      dndUntil: principal.dndUntil,
      heartbeatTimeout: null,
    };
  }

  private parseRequestUrl(hostHeader: string | undefined, requestUrl?: string): URL {
    if (!requestUrl) throw new Error('Missing request URL.');
    return new URL(requestUrl, `http://${hostHeader ?? 'localhost'}`);
  }
}
