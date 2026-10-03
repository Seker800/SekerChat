import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 100;
const EXPIRED_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const REVOKED_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class RefreshTokenCleanupService {
  private readonly logger = new Logger(RefreshTokenCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 10 3 * * *', { name: 'refresh-token-cleanup', timeZone: 'Asia/Shanghai', waitForCompletion: true })
  async cleanup(): Promise<void> {
    const expiredBefore = new Date(Date.now() - EXPIRED_GRACE_MS);
    const revokedBefore = new Date(Date.now() - REVOKED_GRACE_MS);
    const eligible = {
      OR: [{ expiresAt: { lt: expiredBefore } }, { revokedAt: { lt: revokedBefore } }],
    };
    let removed = 0;
    for (let batch = 0; batch < 100; batch += 1) {
      const rows = await this.prisma.refreshToken.findMany({
        where: eligible,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });
      if (!rows.length) break;
      const result = await this.prisma.refreshToken.deleteMany({
        where: { AND: [eligible, { id: { in: rows.map((row) => row.id) } }] },
      });
      removed += result.count;
      if (rows.length < BATCH_SIZE || result.count === 0) break;
    }
    if (removed) this.logger.log(`Removed ${removed} expired refresh token(s)`);
  }
}
