import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceConfigService } from '../system-config/attendance-config.service';
import {
  getLocalDayBoundaryUtc,
  parseAttendanceConfig,
  shiftDateKey,
  zonedDateParts,
} from './attendance.utils';
import { AttendanceProjectionService } from './attendance-projection.service';

const RAW_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
/** Days per run, not user-days: one night can compact every user for a day. */
const MAX_DAYS_PER_RUN = 100;

@Injectable()
export class PresenceRetentionService {
  private readonly logger = new Logger(PresenceRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AttendanceConfigService,
    private readonly projections: AttendanceProjectionService,
  ) {}

  @Cron('0 40 4 * * *', {
    name: 'presence-retention',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  async compactOldDays(): Promise<void> {
    const { timezone } = parseAttendanceConfig(await this.config.getRawConfig());
    const conflictingSummary = await this.prisma.presenceDailySummary.findFirst({
      where: { timezone: { not: timezone } },
      select: { id: true },
    });
    if (conflictingSummary) {
      this.logger.error(
        'Presence compaction stopped because historical summaries use another timezone',
      );
      return;
    }
    const cutoff = new Date(Date.now() - RAW_RETENTION_MS);
    let compacted = 0;
    for (let batch = 0; batch < MAX_DAYS_PER_RUN; batch += 1) {
      const oldest = await this.prisma.presenceLog.findFirst({
        where: { createdAt: { lt: cutoff } },
        orderBy: { createdAt: 'asc' },
        select: { userId: true, createdAt: true },
      });
      if (!oldest) break;
      const workDate = zonedDateParts(oldest.createdAt, timezone).dateKey;
      const start = getLocalDayBoundaryUtc(workDate, timezone);
      const end = getLocalDayBoundaryUtc(shiftDateKey(workDate, 1), timezone);
      if (end > cutoff) break;

      const dayLogs = await this.prisma.presenceLog.findMany({
        where: { createdAt: { gte: start, lt: end } },
          orderBy: { createdAt: 'asc' },
        select: { userId: true, createdAt: true, isOnline: true, isDnd: true },
      });
      if (dayLogs.length === 0) break;

      const userIds = [...new Set(dayLogs.map((log) => log.userId))];
      const [previousLogs, previousSummaries] = await Promise.all([
        this.prisma.$queryRaw<
          Array<{ userId: string; createdAt: Date; isOnline: boolean; isDnd: boolean }>
        >(Prisma.sql`
          SELECT DISTINCT ON ("userId") "userId", "createdAt", "isOnline", "isDnd"
          FROM "PresenceLog"
          WHERE "userId" IN (${Prisma.join(userIds)}) AND "createdAt" < ${start}
          ORDER BY "userId", "createdAt" DESC
        `),
        this.prisma.$queryRaw<
          Array<{
            userId: string;
            workDate: string;
            endIsOnline: boolean;
            endIsDnd: boolean;
          }>
        >(Prisma.sql`
          SELECT DISTINCT ON ("userId")
            "userId", "workDate", "endIsOnline", "endIsDnd"
          FROM "PresenceDailySummary"
          WHERE "userId" IN (${Prisma.join(userIds)}) AND "workDate" < ${workDate}
          ORDER BY "userId", "workDate" DESC
        `),
      ]);
      const previousLogByUser = new Map(previousLogs.map((log) => [log.userId, log]));
      const previousSummaryByUser = new Map(
        previousSummaries.map((summary) => [summary.userId, summary]),
      );
      const logsByUser = new Map<string, typeof dayLogs>();
      for (const log of dayLogs) {
        const logs = logsByUser.get(log.userId) ?? [];
        logs.push(log);
        logsByUser.set(log.userId, logs);
      }

      const summaries: Prisma.PresenceDailySummaryCreateManyInput[] = [];
      for (const userId of userIds) {
        const userLogs = logsByUser.get(userId) ?? [];
        const previousLog = previousLogByUser.get(userId);
        const previousSummary = previousSummaryByUser.get(userId);
        const previous =
          previousLog ??
          (previousSummary
            ? {
        createdAt: new Date(start.getTime() - 1),
        isOnline: previousSummary.endIsOnline,
        isDnd: previousSummary.endIsDnd,
              }
            : null);
        const projection = this.projections
          .projectDailyPresence(
            previous ? [previous, ...userLogs] : userLogs,
        workDate,
        workDate,
        timezone,
          )
          .get(workDate)!;
        const last = userLogs[userLogs.length - 1];
        summaries.push({
          userId,
          workDate,
            timezone,
            firstOnlineAt: projection.firstOnlineAt,
            lastOnlineAt: projection.lastOnlineAt,
            onlineWorkMinutes: projection.onlineWorkMinutes,
            endIsOnline: last?.isOnline ?? previous?.isOnline ?? false,
            endIsDnd: last?.isDnd ?? previous?.isDnd ?? false,
        });
      }

      await this.prisma.$transaction(async (tx) => {
        // Replace the day's summaries and raw events atomically. The summary is
        // the durable form; the raw rows are no longer needed after this commit.
        await tx.presenceDailySummary.deleteMany({ where: { workDate } });
        await tx.presenceDailySummary.createMany({ data: summaries, skipDuplicates: true });
        await tx.presenceLog.deleteMany({ where: { createdAt: { gte: start, lt: end } } });
      });
      compacted += 1;
    }
    if (compacted) this.logger.log(`Compacted ${compacted} presence day(s)`);
  }
}
