import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceConfigService } from '../system-config/attendance-config.service';
import { getLocalDayBoundaryUtc, parseAttendanceConfig, shiftDateKey, zonedDateParts } from './attendance.utils';
import { AttendanceProjectionService } from './attendance-projection.service';

const RAW_RETENTION_MS = 400 * 24 * 60 * 60 * 1000;
const MAX_DAYS_PER_RUN = 100;

@Injectable()
export class PresenceRetentionService {
  private readonly logger = new Logger(PresenceRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AttendanceConfigService,
    private readonly projections: AttendanceProjectionService,
  ) {}

  @Cron('0 40 4 * * *', { name: 'presence-retention', timeZone: 'Asia/Shanghai', waitForCompletion: true })
  async compactOldDays(): Promise<void> {
    const { timezone } = parseAttendanceConfig(await this.config.getRawConfig());
    const conflictingSummary = await this.prisma.presenceDailySummary.findFirst({
      where: { timezone: { not: timezone } },
      select: { id: true },
    });
    if (conflictingSummary) {
      this.logger.error('Presence compaction stopped because historical summaries use another timezone');
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

      const [previousRaw, previousSummary, dayLogs] = await Promise.all([
        this.prisma.presenceLog.findFirst({
          where: { userId: oldest.userId, createdAt: { lt: start } },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, isOnline: true, isDnd: true },
        }),
        this.prisma.presenceDailySummary.findFirst({
          where: { userId: oldest.userId, workDate: { lt: workDate } },
          orderBy: { workDate: 'desc' },
          select: { endIsOnline: true, endIsDnd: true },
        }),
        this.prisma.presenceLog.findMany({
          where: { userId: oldest.userId, createdAt: { gte: start, lt: end } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true, isOnline: true, isDnd: true },
        }),
      ]);
      const previous = previousRaw ?? (previousSummary ? {
        createdAt: new Date(start.getTime() - 1),
        isOnline: previousSummary.endIsOnline,
        isDnd: previousSummary.endIsDnd,
      } : null);
      const projection = this.projections.projectDailyPresence(
        previous ? [previous, ...dayLogs] : dayLogs,
        workDate,
        workDate,
        timezone,
      ).get(workDate)!;
      const last = dayLogs[dayLogs.length - 1];
      await this.prisma.$transaction(async (tx) => {
        await tx.presenceDailySummary.upsert({
          where: { userId_workDate: { userId: oldest.userId, workDate } },
          create: {
            userId: oldest.userId, workDate, timezone,
            firstOnlineAt: projection.firstOnlineAt,
            lastOnlineAt: projection.lastOnlineAt,
            onlineWorkMinutes: projection.onlineWorkMinutes,
            endIsOnline: last?.isOnline ?? previous?.isOnline ?? false,
            endIsDnd: last?.isDnd ?? previous?.isDnd ?? false,
          },
          update: {
            timezone,
            firstOnlineAt: projection.firstOnlineAt,
            lastOnlineAt: projection.lastOnlineAt,
            onlineWorkMinutes: projection.onlineWorkMinutes,
            endIsOnline: last?.isOnline ?? previous?.isOnline ?? false,
            endIsDnd: last?.isDnd ?? previous?.isDnd ?? false,
          },
        });
        await tx.presenceLog.deleteMany({
          where: { userId: oldest.userId, createdAt: { gte: start, lt: end } },
        });
      });
      compacted += 1;
    }
    if (compacted) this.logger.log(`Compacted ${compacted} presence day(s)`);
  }
}
