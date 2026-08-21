import { ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceMode } from '@prisma/client';
import { hasSystemPermission } from '@sekerchat/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceConfigService } from '../system-config/attendance-config.service';
import { PermissionConfigService } from '../system-config/permission-config.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type {
  AttendanceConfig,
  AttendanceDailySummary,
  OnlineDurationSummary,
} from './attendance.types';
import { isCalendarWorkday } from './workday-calendar';
import {
  clampDailyWorkedMinutes,
  computeActiveWindowWorkedMinutes,
  computeWorkedMinutes,
  getLocalDayBoundaryUtc,
  localMinutes,
  monthRangeForDateKey,
  parseAttendanceConfig,
  timeStringToMinutes,
  weekRangeForDateKey,
  shiftDateKey,
  zonedDateParts,
} from './attendance.utils';
import { CheckInCommandService } from './check-in-command.service';
import {
  AttendanceActionRecorder,
  type AttendanceTrackingRequest,
} from './attendance-action-recorder.service';
import { AttendanceQueryService } from './attendance-query.service';
import {
  AttendanceProjectionService,
  type DailyPresenceProjection,
} from './attendance-projection.service';

type CheckInSessionLike = {
  workDate: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
};

const ATTENDANCE_PROJECTION_MODES = [
  AttendanceMode.FLEXIBLE,
] as const;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly attendanceConfigService: AttendanceConfigService,
    private readonly permissionConfigService: PermissionConfigService,
    private readonly checkInCommands: CheckInCommandService,
    private readonly actionRecorder: AttendanceActionRecorder,
    private readonly queries: AttendanceQueryService,
    private readonly projections: AttendanceProjectionService,
  ) {}

  async recordManualAction(request: AttendanceTrackingRequest): Promise<void> {
    return this.actionRecorder.record(request);
  }

  async listDailySummaries(options: {
    limit?: number;
    offset?: number;
    userId?: string;
    workDate?: string;
    mode?: AttendanceMode;
  }) {
    const limit = this.normalizePageLimit(options.limit);
    const offset = this.normalizePageOffset(options.offset);
    if (options.mode && options.mode !== AttendanceMode.FLEXIBLE) {
      return { items: [], total: 0, limit, offset };
    }

    const config = await this.getAttendanceConfig();
    const users = await this.queries.listActiveHumanUsers();
    const targetUsers = (options.userId ? users.filter((user) => user.id === options.userId) : users)
      .sort((left, right) => left.id.localeCompare(right.id));
    const workDates = options.workDate
      ? [options.workDate]
      : await this.listPresenceWorkDates(config.timezone, options.userId);
    const total = workDates.length * targetUsers.length;
    const pagePairs: Array<{ user: (typeof targetUsers)[number]; workDate: string }> = [];
    if (targetUsers.length > 0) {
      const pageEnd = Math.min(offset + limit, total);
      for (let index = offset; index < pageEnd; index += 1) {
        const workDate = workDates[Math.floor(index / targetUsers.length)];
        const user = targetUsers[index % targetUsers.length];
        if (workDate && user) {
          pagePairs.push({ user, workDate });
        }
      }
    }
    const pairsByUser = new Map<string, typeof pagePairs>();
    for (const pair of pagePairs) {
      const userPairs = pairsByUser.get(pair.user.id) ?? [];
      userPairs.push(pair);
      pairsByUser.set(pair.user.id, userPairs);
    }

    const projectionsByUser = new Map<string, Map<string, DailyPresenceProjection>>();
    await Promise.all(
      [...pairsByUser.entries()].map(async ([userId, userPairs]) => {
        const selectedDates = userPairs.map((pair) => pair.workDate).sort();
        const firstDate = selectedDates[0];
        const lastDate = selectedDates[selectedDates.length - 1];
        if (!firstDate || !lastDate) {
          return;
        }
        projectionsByUser.set(
          userId,
          await this.loadDailyPresenceProjections(userId, firstDate, lastDate, config.timezone),
        );
      }),
    );

    const computedAt = new Date();
    const pagedItems = pagePairs.map(({ user, workDate }) => {
      const summary = projectionsByUser.get(user.id)?.get(workDate) ?? this.projections.empty();
      return {
        id: `${user.id}:${workDate}`,
        userId: user.id,
        workDate,
        mode: AttendanceMode.FLEXIBLE,
        clockInAt: summary.firstOnlineAt,
        clockOutAt: summary.lastOnlineAt,
        clockInSource: summary.firstOnlineAt ? 'presence_online' : null,
        clockOutSource: summary.lastOnlineAt ? 'presence_online' : null,
        clockInMissing: summary.firstOnlineAt === null,
        clockOutMissing: summary.lastOnlineAt === null,
        workedMinutes: summary.onlineWorkMinutes,
        computedAt,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
        },
      };
    });

    return {
      items: pagedItems,
      total,
      limit,
      offset,
    };
  }

  async getUserStats(userId: string, dateKey?: string) {
    const config = await this.getAttendanceConfig();
    const anchorDate = dateKey || zonedDateParts(new Date(), config.timezone).dateKey;
    const requiredRange = this.getStatsPresenceRange(anchorDate, config.timezone);
    const dailyProjections = await this.loadDailyPresenceProjections(
      userId,
      requiredRange.startDate,
      anchorDate,
      config.timezone,
    );
    return this.buildUserStats(anchorDate, config, dailyProjections);
  }

  private buildUserStats(
    anchorDate: string,
    config: AttendanceConfig,
    dailyProjections: ReadonlyMap<string, DailyPresenceProjection>,
  ) {
    const weekRange = weekRangeForDateKey(anchorDate, config.timezone);
    const monthRange = monthRangeForDateKey(anchorDate);
    const previousDate = shiftDateKey(anchorDate, -1);
    const monthElapsedWorkDays = this.countMatchingWorkDaysInclusive(monthRange.startDate, anchorDate, config.timezone, config.workDays);
    const weekElapsedWorkDays = this.countMatchingWorkDaysInclusive(weekRange.startDate, anchorDate, config.timezone, config.workDays);
    const preferredMode = AttendanceMode.FLEXIBLE;
    const daily = dailyProjections.get(anchorDate) ?? this.projections.empty();
    const previousDaily = dailyProjections.get(previousDate) ?? this.projections.empty();
    const weeklyMinutes = this.sumProjectionMinutes(
      dailyProjections,
      this.enumerateDateKeys(weekRange.startDate, anchorDate),
    );
    const monthlyMinutes = this.sumProjectionMinutes(
      dailyProjections,
      this.enumerateDateKeys(monthRange.startDate, anchorDate),
    );

    return {
      workDate: anchorDate,
      mode: preferredMode,
      firstOnlineAt: daily.firstOnlineAt?.toISOString() ?? null,
      lastOnlineAt: daily.lastOnlineAt?.toISOString() ?? null,
      dayWorkedMinutes: daily.onlineWorkMinutes,
      previousWorkDate: previousDate,
      previousDayWorkedMinutes: previousDaily.onlineWorkMinutes,
      weekWorkedMinutes: weeklyMinutes,
      monthWorkedMinutes: monthlyMinutes,
      weekAverageDailyWorkedMinutes: Math.round(weeklyMinutes / weekElapsedWorkDays),
      monthAverageDailyWorkedMinutes: Math.round(monthlyMinutes / monthElapsedWorkDays),
      weekStartDate: weekRange.startDate,
      weekEndDate: weekRange.endDate,
      monthStartDate: monthRange.startDate,
      monthEndDate: monthRange.endDate,
    };
  }

  async getOwnStats(actor: AuthenticatedUser, dateKey?: string) {
    return this.getUserStats(actor.sub, dateKey);
  }

  async getOwnPanel(actor: AuthenticatedUser, days = 30) {
    const config = await this.getAttendanceConfig();
    const today = zonedDateParts(new Date(), config.timezone).dateKey;
    const normalizedDays = this.normalizePanelDays(days);
    const startDate = shiftDateKey(today, -(normalizedDays - 1));
    const dateKeys = this.enumerateDateKeys(startDate, today);
    const statsRange = this.getStatsPresenceRange(today, config.timezone);
    const projectionStart = startDate < statsRange.startDate ? startDate : statsRange.startDate;
    const dailyProjections = await this.loadDailyPresenceProjections(
      actor.sub,
      projectionStart,
      today,
      config.timezone,
    );
    const stats = this.buildUserStats(today, config, dailyProjections);
    const dailySeries = dateKeys.map((dateKey) => ({
      workDate: dateKey,
      onlineMinutes: dailyProjections.get(dateKey)?.onlineWorkMinutes ?? 0,
    }));
    const todaySegments = dailyProjections.get(today)?.segments ?? [];

    return {
      summary: stats,
      dailySeries,
      todaySegments,
      range: {
        startDate,
        endDate: today,
        days: normalizedDays,
      },
    };
  }

  async getOwnCheckInToday(actor: AuthenticatedUser) {
    const config = await this.getAttendanceConfig();
    const workDate = zonedDateParts(new Date(), config.timezone).dateKey;
    return this.getCheckInDayState(actor.sub, workDate, config.timezone);
  }

  async resetOwnCheckInTodayForDev(actor: AuthenticatedUser) {
    const config = await this.getAttendanceConfig();
    const workDate = zonedDateParts(new Date(), config.timezone).dateKey;
    const deletedCount = await this.checkInCommands.resetForDevelopment(actor.sub, workDate);

    return {
      workDate,
      deletedCount,
    };
  }

  async checkIn(actor: AuthenticatedUser) {
    const config = await this.getAttendanceConfig();
    const now = new Date();
    const workDate = zonedDateParts(now, config.timezone).dateKey;
    await this.checkInCommands.checkIn(actor.sub, workDate, now);

    return this.getCheckInDayState(actor.sub, workDate, config.timezone);
  }

  async checkOut(actor: AuthenticatedUser) {
    const config = await this.getAttendanceConfig();
    const now = new Date();
    const workDate = zonedDateParts(now, config.timezone).dateKey;
    const result = await this.checkInCommands.checkOut(actor.sub, workDate, now);
    if (result.unchangedSessions) {
      return this.getCheckInDayState(actor.sub, workDate, config.timezone, result.unchangedSessions, now);
    }

    return this.getCheckInDayState(actor.sub, workDate, config.timezone);
  }

  async getOwnCheckInPanel(actor: AuthenticatedUser, days = 30) {
    const config = await this.getAttendanceConfig();
    const today = zonedDateParts(new Date(), config.timezone).dateKey;
    const normalizedDays = this.normalizePanelDays(days);
    const startDate = shiftDateKey(today, -(normalizedDays - 1));
    const dateKeys = this.enumerateDateKeys(startDate, today);
    const currentYearStartDate = `${today.slice(0, 4)}-01-01`;
    const yearDateKeys = this.enumerateDateKeys(currentYearStartDate, today);
    const [yearRecords, dailyProjections] = await Promise.all([
      this.prismaService.checkInSession.findMany({
        where: {
          userId: actor.sub,
          workDate: {
            gte: currentYearStartDate,
            lte: today,
          },
        },
      }),
      this.loadDailyPresenceProjections(
        actor.sub,
        currentYearStartDate,
        today,
        config.timezone,
      ),
    ]);
    const records = yearRecords.filter((record) => record.workDate >= startDate);
    const todaySessions = yearRecords.filter((record) => record.workDate === today);
    const todayState = {
      ...this.summarizeCheckInSessions(today, todaySessions, { now: new Date() }),
      onlineMinutes: dailyProjections.get(today)?.onlineWorkMinutes ?? 0,
    };
    const ownStats = this.buildUserStats(today, config, dailyProjections);
    const onlineSeries = dateKeys.map((workDate) => ({
      workDate,
      onlineMinutes: dailyProjections.get(workDate)?.onlineWorkMinutes ?? 0,
    }));
    const yearOnlineSeries = yearDateKeys.map((workDate) => ({
      workDate,
      onlineMinutes: dailyProjections.get(workDate)?.onlineWorkMinutes ?? 0,
    }));

    const recordSessionMap = this.groupCheckInSessionsByWorkDate(records);
    const statusSeries = dateKeys.map((workDate): {
      workDate: string;
      status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT';
      checkInAt: string | null;
      checkOutAt: string | null;
      checkInMinutes: number;
    } => {
      const sessions = recordSessionMap.get(workDate) ?? [];
      return this.summarizeCheckInSessions(workDate, sessions, {
        now: workDate === today ? new Date() : null,
      });
    });

    const checkedInDays = statusSeries.filter((item) => item.status !== 'NOT_CHECKED_IN').length;
    const completedDays = statusSeries.filter((item) => item.status === 'CHECKED_OUT').length;
    const checkInSeries = statusSeries.map((item) => ({
      workDate: item.workDate,
      checkInMinutes: item.checkInMinutes,
    }));
    const yearSessionMap = this.groupCheckInSessionsByWorkDate(yearRecords);
    const yearCheckInSeries = yearDateKeys.map((workDate) => {
      const sessions = yearSessionMap.get(workDate) ?? [];
      return {
        workDate,
        checkInMinutes: this.calculateCheckInMinutes(sessions, workDate === today ? new Date() : null),
      };
    });
    const averages = {
      online: this.buildProjectedWorkdayAverages(
        yearOnlineSeries.map((item) => ({ workDate: item.workDate, minutes: item.onlineMinutes })),
        today,
        config.timezone,
        config.workDays,
      ),
      checkIn: this.buildProjectedWorkdayAverages(
        yearCheckInSeries.map((item) => ({ workDate: item.workDate, minutes: item.checkInMinutes })),
        today,
        config.timezone,
        config.workDays,
      ),
    };

    return {
      today: todayState,
      summary: {
        checkedInDays,
        completedDays,
        completionRate: statusSeries.length ? Math.round((completedDays / statusSeries.length) * 100) : 0,
        consecutiveCheckInDays: this.countTrailingCheckInDays(statusSeries),
        onlineTodayMinutes: ownStats.dayWorkedMinutes ?? 0,
        averages,
      },
      statusSeries,
      recentRecords: statusSeries.slice(-7).reverse(),
      checkInSeries,
      onlineSeries,
      range: {
        startDate,
        endDate: today,
        days: normalizedDays,
      },
    };
  }

  async listUserStats(actor: AuthenticatedUser, dateKey?: string) {
    const users = await this.queries.listActiveHumanUsers();
    const entries = await Promise.all(
      users.map(async (user) => ({
        user,
        stats: await this.getUserStats(user.id, dateKey),
      })),
    );
    return {
      items: entries,
      total: entries.length,
    };
  }

  async listUserAttendanceAverages() {
    const config = await this.getAttendanceConfig();
    const today = zonedDateParts(new Date(), config.timezone).dateKey;
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const users = await this.queries.listActiveHumanUsers();

    const items = await Promise.all(
      users.map(async (user) => {
        const dailyProjections = await this.loadDailyPresenceProjections(
          user.id,
          yearStart,
          today,
          config.timezone,
        );
        const onlineDailyMap = new Map(
          [...dailyProjections].map(([workDate, projection]) => [
            workDate,
            projection.onlineWorkMinutes,
          ]),
        );

        const checkInSessions = await this.prismaService.checkInSession.findMany({
          where: {
            userId: user.id,
            workDate: { gte: yearStart, lte: today },
          },
          select: { workDate: true, checkInAt: true, checkOutAt: true },
        });

        const sessionMap = this.groupCheckInSessionsByWorkDate(checkInSessions);

        const dateKeys = this.enumerateDateKeys(yearStart, today);

        const onlineSeries = dateKeys.map((dateKey) => ({
          workDate: dateKey,
          minutes: onlineDailyMap.get(dateKey) ?? 0,
        }));

        const checkInSeries = dateKeys.map((dateKey) => {
          const minutes = this.calculateCheckInMinutes(sessionMap.get(dateKey) ?? [], dateKey === today ? new Date() : null);
          return { workDate: dateKey, minutes };
        });

        const onlineAverages = this.buildProjectedWorkdayAverages(
          onlineSeries,
          today,
          config.timezone,
          config.workDays,
        );
        const checkInAverages = this.buildProjectedWorkdayAverages(
          checkInSeries,
          today,
          config.timezone,
          config.workDays,
        );

        const todayOnline = onlineDailyMap.get(today) ?? 0;
        const todayCheckIn =
          checkInSeries.find((s) => s.workDate === today)?.minutes ?? 0;

        return {
          user,
          online: {
            todayMinutes: todayOnline,
            monthAverageMinutes: onlineAverages.monthAverageMinutes,
            totalAverageMinutes: onlineAverages.totalAverageMinutes,
          },
          checkIn: {
            todayMinutes: todayCheckIn,
            monthAverageMinutes: checkInAverages.monthAverageMinutes,
            totalAverageMinutes: checkInAverages.totalAverageMinutes,
          },
        };
      }),
    );

    return { items, total: items.length };
  }

  async listUsersWithAttendanceMode(actor: AuthenticatedUser) {
    return this.queries.listVisibleUsers(actor);
  }

  async updateUserMode(actor: AuthenticatedUser, userId: string, mode: AttendanceMode) {
    const rp = await this.permissionConfigService.getRolePermissions();
    if (actor.role !== 'SUPER_ADMIN' && !hasSystemPermission(rp, actor.role, 'manage_user_roles')) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    const policy = await this.prismaService.attendanceUserPolicy.upsert({
      where: { userId },
      create: { userId, mode },
      update: { mode },
    });

    return policy;
  }

  async recomputeAllUsers(): Promise<void> {
    const userIds = await this.prismaService.user.findMany({
      where: { disabledAt: null, isBot: false },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const user of userIds) {
      await this.recomputeAllUserDays(user.id);
    }
  }

  async recomputeRecentDays(): Promise<void> {
    const config = await this.getAttendanceConfig();
    const recentEvents = await this.prismaService.attendanceActionEvent.findMany({
      where: {
        occurredAt: {
          gte: new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)),
        },
      },
      select: {
        userId: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'desc' },
    });

    const pairs = new Set<string>();
    for (const event of recentEvents) {
      const dateKey = zonedDateParts(event.occurredAt, config.timezone).dateKey;
      pairs.add(`${event.userId}::${dateKey}`);
      const activeWindowEnd = new Date(event.occurredAt.getTime() + (config.activeWindowMinutes * 60_000));
      const activeWindowEndDateKey = zonedDateParts(activeWindowEnd, config.timezone).dateKey;
      if (activeWindowEndDateKey !== dateKey) {
        pairs.add(`${event.userId}::${activeWindowEndDateKey}`);
      }
    }

    for (const pair of pairs) {
      const [userId, dateKey] = pair.split('::');
      await this.recomputeUserDayProjections(userId, dateKey, config);
    }
  }

  async getAttendanceConfig(): Promise<AttendanceConfig> {
    const config = await this.attendanceConfigService.getRawConfig();
    return parseAttendanceConfig(config);
  }

  async recomputeAllUserDays(userId: string): Promise<void> {
    const config = await this.getAttendanceConfig();
    const events = await this.prismaService.attendanceActionEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: 'asc' },
      select: { occurredAt: true },
    });

    const dateKeys = new Set<string>();
    for (const event of events) {
      const dateKey = zonedDateParts(event.occurredAt, config.timezone).dateKey;
      dateKeys.add(dateKey);
      const activeWindowEnd = new Date(event.occurredAt.getTime() + (config.activeWindowMinutes * 60_000));
      const activeWindowEndDateKey = zonedDateParts(activeWindowEnd, config.timezone).dateKey;
      if (activeWindowEndDateKey !== dateKey) {
        dateKeys.add(activeWindowEndDateKey);
      }
    }

    if (!dateKeys.size) {
      await this.prismaService.attendanceDaily.deleteMany({ where: { userId } });
      return;
    }

    const existingRows = await this.prismaService.attendanceDaily.findMany({
      where: { userId },
      select: { workDate: true },
    });
    const existingDates = new Set(existingRows.map((row) => row.workDate));

    for (const dateKey of dateKeys) {
      await this.recomputeUserDayProjections(userId, dateKey, config);
    }

    const staleDates = [...existingDates].filter((dateKey) => !dateKeys.has(dateKey));
    if (staleDates.length) {
      await this.prismaService.attendanceDaily.deleteMany({
        where: {
          userId,
          workDate: { in: staleDates },
        },
      });
    }
  }

  private async recomputeUserDayProjections(
    userId: string,
    workDate: string,
    config: AttendanceConfig,
    dayEventDates?: Date[],
  ): Promise<void> {
    const normalizedDayEventDates = dayEventDates ?? await this.loadDayEventDates(userId, workDate, config);
    await Promise.all(
      ATTENDANCE_PROJECTION_MODES.map((mode) => this.recomputeUserDayProjection(
        userId,
        workDate,
        config,
        normalizedDayEventDates,
        mode,
      )),
    );
  }

  private async recomputeUserDayProjection(
    userId: string,
    workDate: string,
    config: AttendanceConfig,
    normalizedDayEventDates: Date[],
    mode: AttendanceMode,
  ): Promise<void> {
    const dayEvents = normalizedDayEventDates.map((occurredAt) => ({ occurredAt }));
    const parts = dayEvents[0]
      ? zonedDateParts(dayEvents[0].occurredAt, config.timezone)
      : this.parseWorkDate(workDate, config.timezone);

    const isWorkDay = config.workDays.includes(parts.weekday);

    let summary: AttendanceDailySummary;
    if (mode === AttendanceMode.FLEXIBLE) {
      const first = dayEvents[0] ?? null;
      const last = dayEvents[dayEvents.length - 1] ?? null;
      const workedMinutes = computeActiveWindowWorkedMinutes(
        normalizedDayEventDates,
        workDate,
        config.timezone,
        config.activeWindowMinutes,
      );
      summary = {
        userId,
        workDate,
        mode,
        clockInAt: first?.occurredAt ?? null,
        clockOutAt: last?.occurredAt ?? null,
        clockInSource: first ? 'manual_action' : null,
        clockOutSource: last ? 'manual_action' : null,
        clockInMissing: !first,
        clockOutMissing: !last,
        workedMinutes,
        computedAt: new Date(),
      };
    } else if (!isWorkDay) {
      summary = {
        userId,
        workDate,
        mode,
        clockInAt: null,
        clockOutAt: null,
        clockInSource: null,
        clockOutSource: null,
        clockInMissing: false,
        clockOutMissing: false,
        workedMinutes: null,
        computedAt: new Date(),
      };
    } else {
      const clockInStart = timeStringToMinutes(config.clockInStart);
      const clockInEnd = timeStringToMinutes(config.clockInEnd);
      const clockOutStart = timeStringToMinutes(config.clockOutStart);
      const clockOutEnd = timeStringToMinutes(config.clockOutEnd);
      const inEvents = dayEvents.filter((event) => {
        const minutes = localMinutes(event.occurredAt, config.timezone);
        return minutes >= clockInStart && minutes <= clockInEnd;
      });
      const outEvents = dayEvents.filter((event) => {
        const minutes = localMinutes(event.occurredAt, config.timezone);
        return minutes >= clockOutStart && minutes <= clockOutEnd;
      });
      const first = inEvents[0] ?? null;
      const last = outEvents[outEvents.length - 1] ?? null;
      summary = {
        userId,
        workDate,
        mode,
        clockInAt: first?.occurredAt ?? null,
        clockOutAt: last?.occurredAt ?? null,
        clockInSource: first ? 'manual_action' : null,
        clockOutSource: last ? 'manual_action' : null,
        clockInMissing: !first,
        clockOutMissing: !last,
        workedMinutes: computeWorkedMinutes(mode, first?.occurredAt ?? null, last?.occurredAt ?? null, config.scheduledBreakMinutes),
        computedAt: new Date(),
      };
    }

    await this.prismaService.attendanceDaily.upsert({
      where: {
        userId_workDate_mode: {
          userId,
          workDate,
          mode,
        },
      },
      create: {
        userId: summary.userId,
        workDate: summary.workDate,
        mode: summary.mode,
        clockInAt: summary.clockInAt,
        clockOutAt: summary.clockOutAt,
        clockInSource: summary.clockInSource,
        clockOutSource: summary.clockOutSource,
        clockInMissing: summary.clockInMissing,
        clockOutMissing: summary.clockOutMissing,
        workedMinutes: summary.workedMinutes,
        computedAt: summary.computedAt,
      },
      update: {
        mode: summary.mode,
        clockInAt: summary.clockInAt,
        clockOutAt: summary.clockOutAt,
        clockInSource: summary.clockInSource,
        clockOutSource: summary.clockOutSource,
        clockInMissing: summary.clockInMissing,
        clockOutMissing: summary.clockOutMissing,
        workedMinutes: summary.workedMinutes,
        computedAt: summary.computedAt,
      },
    });
  }

  private async loadDayEventDates(userId: string, workDate: string, config: AttendanceConfig): Promise<Date[]> {
    const previousDate = shiftDateKey(workDate, -1);
    const nextDate = shiftDateKey(workDate, 1);
    const [previousYear, previousMonth, previousDay] = previousDate.split('-').map((value) => Number.parseInt(value, 10));
    const [nextYear, nextMonth, nextDay] = nextDate.split('-').map((value) => Number.parseInt(value, 10));
    const dayEvents = await this.prismaService.attendanceActionEvent.findMany({
      where: {
        userId,
        occurredAt: {
          gte: new Date(Date.UTC(previousYear, previousMonth - 1, previousDay - 1, 0, 0, 0, 0)),
          lt: new Date(Date.UTC(nextYear, nextMonth - 1, nextDay + 1, 23, 59, 59, 999)),
        },
      },
      orderBy: { occurredAt: 'asc' },
      select: { occurredAt: true },
    });

    return dayEvents
      .map((event) => event.occurredAt)
      .filter((occurredAt) => {
        const eventDateKey = zonedDateParts(occurredAt, config.timezone).dateKey;
        const activeWindowEnd = new Date(occurredAt.getTime() + (config.activeWindowMinutes * 60_000));
        const activeWindowEndDateKey = zonedDateParts(activeWindowEnd, config.timezone).dateKey;
        return eventDateKey === workDate || activeWindowEndDateKey === workDate;
      });
  }

  private parseWorkDate(workDate: string, timeZone: string) {
    const [year, month, day] = workDate.split('-').map((value) => Number.parseInt(value, 10));
    const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return zonedDateParts(probe, timeZone);
  }

  private countInclusiveDays(startDate: string, endDate: string): number {
    const [startYear, startMonth, startDay] = startDate.split('-').map((value) => Number.parseInt(value, 10));
    const [endYear, endMonth, endDay] = endDate.split('-').map((value) => Number.parseInt(value, 10));
    const start = Date.UTC(startYear, startMonth - 1, startDay, 12, 0, 0, 0);
    const end = Date.UTC(endYear, endMonth - 1, endDay, 12, 0, 0, 0);
    return Math.max(1, Math.floor((end - start) / (24 * 60 * 60 * 1000)) + 1);
  }

  private countMatchingWorkDaysInclusive(
    startDate: string,
    endDate: string,
    timeZone: string,
    workDays: number[],
  ): number {
    let count = 0;
    let cursor = startDate;
    while (cursor <= endDate) {
      const parts = this.parseWorkDate(cursor, timeZone);
      if (isCalendarWorkday(cursor, parts.weekday, workDays)) {
        count += 1;
      }
      cursor = shiftDateKey(cursor, 1);
    }

    return Math.max(1, count);
  }

  private buildProjectedWorkdayAverages(
    series: Array<{ workDate: string; minutes: number }>,
    anchorDate: string,
    timeZone: string,
    workDays: number[],
  ): { monthAverageMinutes: number; totalAverageMinutes: number } {
    const monthRange = monthRangeForDateKey(anchorDate);
    const monthSeries = series.filter((item) => item.workDate >= monthRange.startDate && item.workDate <= anchorDate);
    const yearSeries = series.filter((item) => item.workDate >= `${anchorDate.slice(0, 4)}-01-01` && item.workDate <= anchorDate);

    const firstMonthDataDate = monthSeries.find((item) => item.minutes > 0)?.workDate ?? null;
    const firstYearDataDate = yearSeries.find((item) => item.minutes > 0)?.workDate ?? null;

    const monthWorkedMinutes = firstMonthDataDate
      ? monthSeries
        .filter((item) => item.workDate >= firstMonthDataDate)
        .reduce((sum, item) => sum + item.minutes, 0)
      : 0;
    const yearWorkedMinutes = firstYearDataDate
      ? yearSeries
        .filter((item) => item.workDate >= firstYearDataDate)
        .reduce((sum, item) => sum + item.minutes, 0)
      : 0;

    const monthWorkDays = firstMonthDataDate
      ? this.countMatchingWorkDaysInclusive(firstMonthDataDate, anchorDate, timeZone, workDays)
      : 0;
    const yearWorkDays = firstYearDataDate
      ? this.countMatchingWorkDaysInclusive(firstYearDataDate, anchorDate, timeZone, workDays)
      : 0;

    return {
      monthAverageMinutes: monthWorkDays > 0 ? Math.round(monthWorkedMinutes / monthWorkDays) : 0,
      totalAverageMinutes: yearWorkDays > 0 ? Math.round(yearWorkedMinutes / yearWorkDays) : 0,
    };
  }

  private async getCheckInDayState(
    userId: string,
    workDate: string,
    timezone: string,
    prefetchedSessions?: ReadonlyArray<CheckInSessionLike>,
    now = new Date(),
  ) {
    const sessions = prefetchedSessions ?? await this.prismaService.checkInSession.findMany({
      where: {
        userId,
        workDate,
      },
    });
    const online = await this.computeOnlineDurationForUserDate(userId, workDate, timezone);
    const summary = this.summarizeCheckInSessions(workDate, sessions, { now });

    return {
      ...summary,
      onlineMinutes: online.onlineWorkMinutes,
    };
  }

  private countTrailingCheckInDays(
    statusSeries: ReadonlyArray<{ status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT' }>,
  ): number {
    let count = 0;
    for (let index = statusSeries.length - 1; index >= 0; index -= 1) {
      if (statusSeries[index]?.status === 'NOT_CHECKED_IN') {
        break;
      }
      count += 1;
    }
    return count;
  }

  private static readonly NO_CHECKOUT_MINUTES = 180; // 3h

  private groupCheckInSessionsByWorkDate<T extends CheckInSessionLike>(sessions: ReadonlyArray<T>): Map<string, T[]> {
    const grouped = new Map<string, T[]>();
    const sortedSessions = [...sessions].sort((left, right) => {
      if (left.workDate !== right.workDate) {
        return left.workDate.localeCompare(right.workDate);
      }

      const leftTime = left.checkInAt?.getTime() ?? 0;
      const rightTime = right.checkInAt?.getTime() ?? 0;
      return leftTime - rightTime;
    });

    for (const session of sortedSessions) {
      const current = grouped.get(session.workDate) ?? [];
      current.push(session);
      grouped.set(session.workDate, current);
    }

    return grouped;
  }

  private findLatestOpenSession<T extends CheckInSessionLike>(sessions: ReadonlyArray<T>): T | null {
    const sorted = [...sessions].sort((left, right) => {
      const leftTime = left.checkInAt?.getTime() ?? 0;
      const rightTime = right.checkInAt?.getTime() ?? 0;
      return rightTime - leftTime;
    });

    return sorted.find((session) => session.checkInAt && !session.checkOutAt) ?? null;
  }

  private summarizeCheckInSessions(
    workDate: string,
    sessions: ReadonlyArray<CheckInSessionLike>,
    options?: { now?: Date | null },
  ): {
    workDate: string;
    status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT';
    checkInAt: string | null;
    checkOutAt: string | null;
    checkInMinutes: number;
  } {
    const validSessions = sessions.filter((session) => session.checkInAt).sort((left, right) => {
      const leftTime = left.checkInAt?.getTime() ?? 0;
      const rightTime = right.checkInAt?.getTime() ?? 0;
      return leftTime - rightTime;
    });

    if (validSessions.length === 0) {
      return {
        workDate,
        status: 'NOT_CHECKED_IN',
        checkInAt: null,
        checkOutAt: null,
        checkInMinutes: 0,
      };
    }

    const openSession = this.findLatestOpenSession(validSessions);
    const latestClosedSession = [...validSessions]
      .filter((session) => session.checkOutAt)
      .sort((left, right) => (right.checkOutAt?.getTime() ?? 0) - (left.checkOutAt?.getTime() ?? 0))[0] ?? null;

    return {
      workDate,
      status: openSession ? 'CHECKED_IN' : 'CHECKED_OUT',
      checkInAt: validSessions[0]?.checkInAt?.toISOString() ?? null,
      checkOutAt: openSession ? null : latestClosedSession?.checkOutAt?.toISOString() ?? null,
      checkInMinutes: this.calculateCheckInMinutes(validSessions, options?.now ?? null),
    };
  }

  private calculateCheckInMinutes(
    sessions: ReadonlyArray<CheckInSessionLike>,
    now: Date | null,
  ): number {
    return clampDailyWorkedMinutes(
      sessions.reduce((sum, session) => sum + this.calculateSessionMinutes(session, now), 0),
    );
  }

  private calculateSessionMinutes(session: CheckInSessionLike, now: Date | null): number {
    if (!session.checkInAt) {
      return 0;
    }

    if (!session.checkOutAt) {
      if (!now) {
        return AttendanceService.NO_CHECKOUT_MINUTES;
      }

      return Math.max(0, Math.floor((now.getTime() - session.checkInAt.getTime()) / 60_000));
    }

    return Math.max(0, Math.floor((session.checkOutAt.getTime() - session.checkInAt.getTime()) / 60_000));
  }

  private async listPresenceWorkDates(timezone: string, userId?: string): Promise<string[]> {
    const logs = await this.prismaService.presenceLog.findMany({
      where: userId ? { userId } : undefined,
      select: { createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const seen = new Set<string>();
    for (const log of logs) {
      seen.add(zonedDateParts(log.createdAt, timezone).dateKey);
    }

    return [...seen].sort((left, right) => right.localeCompare(left));
  }

  private enumerateDateKeys(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    let cursor = startDate;
    while (cursor <= endDate) {
      dates.push(cursor);
      cursor = shiftDateKey(cursor, 1);
    }
    return dates;
  }

  private async computeOnlineDurationForUserDate(
    userId: string,
    workDate: string,
    timezone: string,
  ): Promise<OnlineDurationSummary> {
    const projections = await this.loadDailyPresenceProjections(
      userId,
      workDate,
      workDate,
      timezone,
    );
    const projection = projections.get(workDate) ?? this.projections.empty();
    return {
      firstOnlineAt: projection.firstOnlineAt,
      lastOnlineAt: projection.lastOnlineAt,
      onlineWorkMinutes: projection.onlineWorkMinutes,
    };
  }

  private async loadDailyPresenceProjections(
    userId: string,
    startDate: string,
    endDate: string,
    timezone: string,
  ): Promise<Map<string, DailyPresenceProjection>> {
    const rangeStart = getLocalDayBoundaryUtc(startDate, timezone);
    const rangeEnd = getLocalDayBoundaryUtc(shiftDateKey(endDate, 1), timezone);
    const [previousLog, rangeLogs] = await Promise.all([
      this.prismaService.presenceLog.findFirst({
        where: {
          userId,
          createdAt: { lt: rangeStart },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          isOnline: true,
          isDnd: true,
        },
      }),
      this.prismaService.presenceLog.findMany({
        where: {
          userId,
          createdAt: {
            gte: rangeStart,
            lt: rangeEnd,
          },
        },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          isOnline: true,
          isDnd: true,
        },
      }),
    ]);
    const logs = previousLog ? [previousLog, ...rangeLogs] : rangeLogs;
    return this.projections.projectDailyPresence(logs, startDate, endDate, timezone);
  }

  private getStatsPresenceRange(anchorDate: string, timezone: string): { startDate: string } {
    const weekRange = weekRangeForDateKey(anchorDate, timezone);
    const monthRange = monthRangeForDateKey(anchorDate);
    const previousDate = shiftDateKey(anchorDate, -1);
    return {
      startDate: [weekRange.startDate, monthRange.startDate, previousDate].sort()[0] ?? previousDate,
    };
  }

  private sumProjectionMinutes(
    projections: ReadonlyMap<string, DailyPresenceProjection>,
    dateKeys: ReadonlyArray<string>,
  ): number {
    return dateKeys.reduce(
      (sum, dateKey) => sum + (projections.get(dateKey)?.onlineWorkMinutes ?? 0),
      0,
    );
  }

  private normalizePanelDays(days: number): number {
    if (!Number.isFinite(days)) {
      return 30;
    }
    return Math.max(7, Math.min(Math.trunc(days), 90));
  }

  private normalizePageLimit(limit: number | undefined): number {
    if (!Number.isFinite(limit)) {
      return 50;
    }
    return Math.max(1, Math.min(Math.trunc(limit ?? 50), 200));
  }

  private normalizePageOffset(offset: number | undefined): number {
    if (!Number.isFinite(offset)) {
      return 0;
    }
    return Math.max(0, Math.trunc(offset ?? 0));
  }

}
