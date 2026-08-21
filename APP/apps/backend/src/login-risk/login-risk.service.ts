import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const LOCK_THRESHOLD = 5;
const LOCK_DURATION_MINUTES = 15;
const BLACKLIST_LOCKOUT_COUNT = 2;

export type RiskStatus = 'ok' | 'locked' | 'blacklisted';

export interface RiskCheckResult {
  status: RiskStatus;
  lockedMinutes?: number;
}

export interface BlacklistEntry {
  id: string;
  email: string;
  ip: string;
  failedAttempts: number;
  lastFailedAt: Date | null;
  lockedUntil: Date | null;
  lockoutCount: number;
  blacklistedAt: Date | null;
  unblacklistedBy: string | null;
  unblacklistNote: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class LoginRiskService {
  constructor(private readonly prismaService: PrismaService) {}

  async checkRisk(email: string, ip: string): Promise<RiskCheckResult> {
    const record = await this.prismaService.loginRisk.findUnique({
      where: { email_ip: { email, ip } },
    });

    if (!record) {
      return { status: 'ok' };
    }

    if (record.blacklistedAt && !record.unblacklistedAt) {
      return { status: 'blacklisted' };
    }

    if (record.lockedUntil && record.lockedUntil > new Date()) {
      const remaining = Math.ceil((record.lockedUntil.getTime() - Date.now()) / 60_000);
      return { status: 'locked', lockedMinutes: remaining };
    }

    return { status: 'ok' };
  }

  async enforce(email: string, ip: string): Promise<void> {
    const risk = await this.checkRisk(email, ip);
    if (risk.status === 'blacklisted') {
      throw new ForbiddenException('该账号已被锁定，请联系管理员');
    }
    if (risk.status === 'locked') {
      throw new HttpException(
        `登录尝试次数过多，请在 ${risk.lockedMinutes} 分钟后重试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async recordFailure(email: string, ip: string): Promise<void> {
    await this.prismaService.$transaction(async (tx) => {
      const record = await tx.loginRisk.upsert({
        where: { email_ip: { email, ip } },
        create: {
          email,
          ip,
          failedAttempts: 1,
          lastFailedAt: new Date(),
        },
        update: {
          failedAttempts: { increment: 1 },
          lastFailedAt: new Date(),
        },
      });

      if (
        record.failedAttempts >= LOCK_THRESHOLD &&
        (!record.lockedUntil || record.lockedUntil <= new Date())
      ) {
        const lockedUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
        const newLockoutCount = record.lockoutCount + 1;

        const shouldBlacklist = newLockoutCount >= BLACKLIST_LOCKOUT_COUNT;
        await tx.loginRisk.update({
          where: { id: record.id },
          data: {
            failedAttempts: 0,
            lockedUntil,
            lockoutCount: newLockoutCount,
            blacklistedAt: shouldBlacklist ? new Date() : undefined,
            ...(shouldBlacklist
              ? { unblacklistedAt: null, unblacklistedBy: null, unblacklistNote: null }
              : {}),
          },
        });
      }
    });
  }

  async recordSuccess(email: string, ip: string): Promise<void> {
    const record = await this.prismaService.loginRisk.findUnique({
      where: { email_ip: { email, ip } },
    });

    if (!record) {
      return;
    }

    await this.prismaService.loginRisk.update({
      where: { id: record.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async getBlacklist(params?: {
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: BlacklistEntry[]; total: number }> {
    const page = Math.max(1, params?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params?.pageSize ?? 20));
    const search = params?.search?.trim();

    const where: Record<string, unknown> = {
      blacklistedAt: { not: null },
    };

    if (search) {
      where.OR = [
        { email: { contains: search } },
        { ip: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prismaService.loginRisk.findMany({
        where: where as any,
        orderBy: { blacklistedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prismaService.loginRisk.count({ where: where as any }),
    ]);

    return { items, total };
  }

  async unblacklist(
    id: string,
    actorId: string,
    note?: string,
  ): Promise<BlacklistEntry> {
    return this.prismaService.loginRisk.update({
      where: { id },
      data: {
        unblacklistedAt: new Date(),
        unblacklistedBy: actorId,
        unblacklistNote: note ?? null,
        blacklistedAt: null,
        failedAttempts: 0,
        lockoutCount: 0,
        lockedUntil: null,
      },
    });
  }
}
