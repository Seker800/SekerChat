import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { resolveActorType } from '../common/bot-identity';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthSession } from './auth-session.types';
import { JwtPayload } from '../common/jwt-payload.interface';
import { parseDurationToMilliseconds, parseDurationToSeconds } from './session-duration';

const NOTIFICATION_ENABLED_UNTIL = null;

@Injectable()
export class SessionTokenService {
  private readonly refreshTokenTtlMs: number;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.refreshTokenTtlMs = parseDurationToMilliseconds(
      this.configService.getOrThrow<string>('JWT_REFRESH_TTL'),
    );
  }

  async createSession(
    user: User,
    previousRefreshTokenId?: string,
    preserveNotificationState = false,
  ): Promise<AuthSession> {
    if (user.disabledAt) {
      throw new ForbiddenException('该账号已停用，请联系管理员');
    }

    if (previousRefreshTokenId) {
      await this.prismaService.refreshToken.update({
        where: { id: previousRefreshTokenId },
        data: { revokedAt: new Date() },
      });
    }

    const sessionUser = previousRefreshTokenId || preserveNotificationState
      ? user
      : await this.prismaService.user.update({
          where: { id: user.id },
          data: { dndUntil: NOTIFICATION_ENABLED_UNTIL },
        });

    const payload: JwtPayload = {
      sub: sessionUser.id,
      email: sessionUser.email,
      role: sessionUser.role,
      displayName: sessionUser.displayName,
      actorType: resolveActorType(sessionUser),
      mustChangePassword: sessionUser.mustChangePassword,
      authVersion: sessionUser.authVersion,
    };
    const refreshTokenPayload: JwtPayload = {
      ...payload,
      jti: randomBytes(16).toString('hex'),
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = this.jwtService.sign(refreshTokenPayload, {
      secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: parseDurationToSeconds(
        this.configService.getOrThrow<string>('JWT_REFRESH_TTL'),
      ),
    });

    await this.prismaService.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTokenTtlMs),
        userId: sessionUser.id,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        displayName: sessionUser.displayName,
        role: sessionUser.role,
        mustChangePassword: sessionUser.mustChangePassword,
      },
    };
  }

  async refreshSession(refreshToken: string): Promise<AuthSession> {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prismaService.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    let tokenPayload: JwtPayload;
    try {
      tokenPayload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      await this.prismaService.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    if ((tokenPayload.authVersion ?? 0) !== storedToken.user.authVersion) {
      await this.prismaService.refreshToken.updateMany({
        where: { id: storedToken.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('登录状态已失效，请重新登录。');
    }

    if (storedToken.user.disabledAt) {
      await this.prismaService.refreshToken.updateMany({
        where: {
          userId: storedToken.user.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
      throw new ForbiddenException('该账号已停用，请联系管理员');
    }

    return this.createSession(storedToken.user, storedToken.id);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prismaService.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
