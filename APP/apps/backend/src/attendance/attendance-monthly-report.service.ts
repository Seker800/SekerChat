import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceConfigService } from '../system-config/attendance-config.service';
import { AttendanceService } from './attendance.service';
import { parseAttendanceConfig, shiftDateKey, zonedDateParts } from './attendance.utils';

type MonthlySnapshot = Awaited<ReturnType<AttendanceService['calculateClosedMonthlyReport']>>;

function previousMonth(month: string): string {
  return shiftDateKey(`${month}-01`, -1).slice(0, 7);
}

@Injectable()
export class AttendanceMonthlyReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
    private readonly config: AttendanceConfigService,
  ) {}

  async listOwnReports(actor: AuthenticatedUser) {
    const rows = await this.prisma.attendanceMonthlyReport.findMany({
      where: { userId: actor.sub },
      orderBy: { month: 'desc' },
      select: { month: true, generatedAt: true, snapshot: true },
    });
    return {
      items: rows.map((row) => {
        const snapshot = row.snapshot as MonthlySnapshot;
        return {
          month: row.month,
          generatedAt: row.generatedAt,
          summary: snapshot.summary,
          dayCount: snapshot.days.length,
        };
      }),
    };
  }

  async getOwnReport(actor: AuthenticatedUser, month: string) {
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('月份格式应为 YYYY-MM。');
    }
    const row = await this.prisma.attendanceMonthlyReport.findUnique({
      where: { userId_month: { userId: actor.sub, month } },
      select: { userId: true, generatedAt: true, snapshot: true },
    });
    if (!row) throw new NotFoundException('该月报告尚未生成。');
    return { ...(row.snapshot as MonthlySnapshot), userId: row.userId, generatedAt: row.generatedAt };
  }

  async generateMissingReports(maxHistoricalReports = 50, now = new Date()): Promise<number> {
    const { timezone } = parseAttendanceConfig(await this.config.getRawConfig());
    const currentMonth = zonedDateParts(now, timezone).dateKey.slice(0, 7);
    const lastClosedMonth = previousMonth(currentMonth);
    const [users, existing] = await Promise.all([
      this.prisma.user.findMany({
        where: { isBot: false },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.attendanceMonthlyReport.findMany({
        where: { month: { lte: lastClosedMonth } },
        select: { userId: true, month: true },
      }),
    ]);
    const existingKeys = new Set(existing.map((row) => `${row.userId}:${row.month}`));
    const firstMonthByUser = new Map(
      users.map((user) => [user.id, zonedDateParts(user.createdAt, timezone).dateKey.slice(0, 7)]),
    );
    let created = 0;
    const saveIfMissing = async (userId: string, month: string): Promise<number> => {
      const key = `${userId}:${month}`;
      if (existingKeys.has(key)) return 0;
      const snapshot = await this.attendance.calculateClosedMonthlyReport(userId, month);
      const result = await this.prisma.attendanceMonthlyReport.createMany({
        data: [{ userId, month, snapshot: snapshot as Prisma.InputJsonValue }],
        skipDuplicates: true,
      });
      existingKeys.add(key);
      return result.count;
    };

    // The newly closed month is due for every user; only older backfill is bounded.
    for (const user of users) {
      if (firstMonthByUser.get(user.id)! <= lastClosedMonth) {
        created += await saveIfMissing(user.id, lastClosedMonth);
      }
    }

    let historicalCreated = 0;
    for (const user of users) {
      const firstMonth = firstMonthByUser.get(user.id)!;
      let month = previousMonth(lastClosedMonth);
      while (month >= firstMonth && historicalCreated < maxHistoricalReports) {
        const count = await saveIfMissing(user.id, month);
        historicalCreated += count;
        created += count;
        month = previousMonth(month);
      }
      if (historicalCreated >= maxHistoricalReports) break;
    }
    return created;
  }
}
