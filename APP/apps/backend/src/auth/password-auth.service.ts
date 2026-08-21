import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoginRiskService } from '../login-risk/login-risk.service';
import { PrismaService } from '../prisma/prisma.service';
import { RegistrationConfigService } from '../system-config/registration-config.service';

@Injectable()
export class PasswordAuthService {
  private readonly bootstrapSuperAdminEmail: string | null;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly loginRiskService: LoginRiskService,
    private readonly registrationConfigService: RegistrationConfigService,
  ) {
    this.bootstrapSuperAdminEmail =
      this.configService.get<string>('BOOTSTRAP_SUPER_ADMIN_EMAIL')?.trim().toLowerCase() || null;
  }

  async register(email: string, password: string, displayName?: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing?.disabledAt) {
      throw new ForbiddenException('该账号已停用，请联系管理员');
    }

    if (existing) {
      if (existing.passwordHash) {
        throw new ConflictException('该邮箱已注册，请直接登录');
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await this.prismaService.user.update({
        where: { email: normalizedEmail },
        data: {
          passwordHash,
          displayName: displayName?.trim() || existing.displayName,
          emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
        },
      });
      return user;
    }

    const totalUsers = await this.prismaService.user.count();

    if (totalUsers === 0) {
      if (!this.bootstrapSuperAdminEmail || normalizedEmail !== this.bootstrapSuperAdminEmail) {
        throw new ForbiddenException('首个管理员账号必须使用预配置的引导邮箱创建。');
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await this.prismaService.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          displayName: displayName?.trim() || null,
          role: 'SUPER_ADMIN',
          emailVerifiedAt: new Date(),
        },
      });
      return user;
    }

    const registrationConfig = await this.registrationConfigService.getRegistrationConfig();
    const whitelistRaw =
      registrationConfig.emailWhitelist ||
      this.configService.get<string>('EMAIL_WHITELIST')?.trim();
    if (whitelistRaw) {
      const allowed = this.parseEmailWhitelist(whitelistRaw);
      if (!allowed.includes(normalizedEmail)) {
        throw new ForbiddenException('该邮箱不在注册白名单中');
      }
    }

    if (registrationConfig.registrationOpen !== 'true') {
      throw new ForbiddenException('注册已关闭，请联系管理员');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prismaService.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        displayName: displayName?.trim() || null,
        role: 'MEMBER',
        emailVerifiedAt: new Date(),
      },
    });
    return user;
  }

  private parseEmailWhitelist(raw: string): string[] {
    return raw
      .split(/[\n,]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
  }

  async login(email: string, password: string, ip: string) {
    const normalizedEmail = email.toLowerCase().trim();

    await this.loginRiskService.enforce(normalizedEmail, ip);

    const user = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.passwordHash) {
      await this.loginRiskService.recordFailure(normalizedEmail, ip);
      throw new UnauthorizedException('邮箱或密码错误');
    }

    if (user.disabledAt) {
      await this.loginRiskService.recordFailure(normalizedEmail, ip);
      throw new ForbiddenException('该账号已停用，请联系管理员');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      await this.loginRiskService.recordFailure(normalizedEmail, ip);
      throw new UnauthorizedException('邮箱或密码错误');
    }

    await this.loginRiskService.recordSuccess(normalizedEmail, ip);
    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }
    if (!user.passwordHash) {
      throw new BadRequestException('该账号尚未设置本地密码，请联系管理员。');
    }
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('当前密码错误。');
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      throw new BadRequestException('新密码不能与当前密码相同。');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const [updatedUser] = await this.prismaService.$transaction([
      this.prismaService.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          authVersion: { increment: 1 },
        },
      }),
      this.prismaService.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prismaService.reminderDeviceToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return updatedUser;
  }
}
