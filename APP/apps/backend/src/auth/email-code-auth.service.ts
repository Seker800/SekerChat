import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { User, UserRole } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { LoginRiskService } from '../login-risk/login-risk.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveBootstrapRole } from './user-role-policy';

@Injectable()
export class EmailCodeAuthService {
  private readonly logger = new Logger(EmailCodeAuthService.name);
  private readonly adminEmails: Set<string>;
  private readonly bootstrapSuperAdminEmail: string | null;
  private readonly codeSigningSecret: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly loginRiskService: LoginRiskService,
  ) {
    this.codeSigningSecret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.bootstrapSuperAdminEmail =
      this.configService.get<string>('BOOTSTRAP_SUPER_ADMIN_EMAIL')?.trim().toLowerCase() || null;

    const adminEmails = this.configService.get<string>('ADMIN_EMAILS') ?? '';
    this.adminEmails = new Set(
      adminEmails
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  async requestEmailCode(email: string): Promise<{ deliveryHint: string }> {
    const normalizedEmail = this.normalizeEmail(email);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const code = this.generateEmailCode();

    await this.prismaService.authCode.create({
      data: {
        email: normalizedEmail,
        code: this.hashCode(normalizedEmail, code),
        expiresAt,
      },
    });

    return {
      deliveryHint: '验证码已生成。当前接口不再返回原始验证码，请通过受信通道获取验证码。',
    };
  }

  async consumeEmailCode(email: string, code: string, ip: string): Promise<User> {
    const normalizedEmail = this.normalizeEmail(email);
    await this.loginRiskService.enforce(normalizedEmail, ip);

    const normalizedCode = code.trim();

    const authCode = await this.prismaService.authCode.findFirst({
      where: {
        email: normalizedEmail,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!authCode || !this.codeMatches(normalizedEmail, normalizedCode, authCode.code)) {
      const latestCode = await this.prismaService.authCode.findFirst({
        where: {
          email: normalizedEmail,
        },
        orderBy: { createdAt: 'desc' },
      });
      this.logger.warn('auth_code_lookup_failed');
      this.logger.warn({
        email: normalizedEmail,
        codeLength: normalizedCode.length,
        latestCode: latestCode
          ? {
              id: latestCode.id,
              expiresAt: latestCode.expiresAt.toISOString(),
              consumedAt: latestCode.consumedAt?.toISOString() ?? null,
              createdAt: latestCode.createdAt.toISOString(),
            }
          : null,
        now: new Date().toISOString(),
      });
      await this.loginRiskService.recordFailure(normalizedEmail, ip);
      throw new UnauthorizedException('Invalid or expired email code.');
    }

    const existingUser = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser?.disabledAt) {
      await this.loginRiskService.recordFailure(normalizedEmail, ip);
      throw new ForbiddenException('该账号已停用，请联系管理员');
    }

    const user = existingUser
      ? await this.prismaService.user.update({
          where: { id: existingUser.id },
          data: {
            emailVerifiedAt: existingUser.emailVerifiedAt ?? new Date(),
          },
        })
      : await this.prismaService.user.create({
          data: {
            email: normalizedEmail,
            displayName: normalizedEmail.split('@')[0],
            emailVerifiedAt: new Date(),
            role: await this.resolveInitialUserRole(normalizedEmail),
          },
        });

    const consumed = await this.prismaService.authCode.updateMany({
      where: {
        id: authCode.id,
        consumedAt: null,
      },
      data: {
        consumedAt: new Date(),
        userId: user.id,
      },
    });

    if (consumed.count === 0) {
      this.logger.warn('auth_code_already_consumed', JSON.stringify({ email: normalizedEmail }));
      await this.loginRiskService.recordFailure(normalizedEmail, ip);
      throw new UnauthorizedException('Email code has already been used.');
    }

    await this.loginRiskService.recordSuccess(normalizedEmail, ip);
    return user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async resolveInitialUserRole(email: string): Promise<UserRole> {
    const totalUsers = await this.prismaService.user.count();
    return resolveBootstrapRole(totalUsers, email, this.adminEmails, this.bootstrapSuperAdminEmail);
  }

  private generateEmailCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private hashCode(email: string, code: string): string {
    return createHmac('sha256', this.codeSigningSecret)
      .update(`${email}:${code}`)
      .digest('hex');
  }

  private codeMatches(email: string, code: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hashCode(email, code), 'utf8');
    const expected = Buffer.from(expectedHash, 'utf8');
    if (actual.length !== expected.length) {
      return false;
    }
    return timingSafeEqual(actual, expected);
  }
}
