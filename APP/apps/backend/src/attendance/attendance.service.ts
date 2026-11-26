import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceMode, Prisma } from '@prisma/client';
import { hasSystemPermission } from '@sekerchat/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceConfigService } from '../system-config/attendance-config.service';
import { PermissionConfigService } from '../system-config/permission-config.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import type { AttendanceConfig, AttendanceDailySummary } from './attendance.types';
import { isCalendarWorkday } from './workday-calendar';
import {
  clampDailyWorkedMinutes,
  MAX_DAILY_ACTIVE_WORKED_MINUTES,
  computeActiveWindowWorkedMinutes,
  computeWorkedMinutes,
  getLocalDayBoundaryUtc,
  localMinutes,
  monthRangeForDateKey,
  parseAttendanceConfig,
  timeStringToMinutes,
  weekRangeForDateKey,
  shiftDateKey,
  weekdayForDateKey,
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

const ATTENDANCE_PROJECTION_MODES = [AttendanceMode.FLEXIBLE] as const;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);
  private recomputeAllRun: Promise<void> | null = null;

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
    const targetUsers = (
      options.userId ? users.filter((user) => user.id === options.userId) : users
    ).sort((left, right) => left.id.localeCompare(right.id));
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
        const summaries = await this.prismaService.presenceDailySummary.findMany({
          where: { userId, workDate: { in: selectedDates } },
        });
        const projections = new Map<string, DailyPresenceProjection>();
        for (const summary of summaries) {
          projections.set(summary.workDate, {
            firstOnlineAt: summary.firstOnlineAt,
            lastOnlineAt: summary.lastOnlineAt,
            onlineWorkMinutes: summary.onlineWorkMinutes,
            segments: [],
          });
        }
        const liveDates = selectedDates.filter((date) => !projections.has(date));
        if (liveDates.length) {
          const live = await this.loadDailyPresenceProjections(
            userId,
            liveDates[0],
            liveDates[liveDates.length - 1],
            config.timezone,
          );
          for (const [date, projection] of live) projections.set(date, projection);
        }
        projectionsByUser.set(userId, projections);
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
    const monthElapsedWorkDays = this.countMatchingWorkDaysInclusive(
      monthRange.startDate,
      anchorDate,
      config.timezone,
      config.workDays,
    );
    const weekElapsedWorkDays = this.countMatchingWorkDaysInclusive(
      weekRange.startDate,
      anchorDate,
      config.timezone,
      config.workDays,
    );
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

  async calculateClosedMonthlyReport(userId: string, month: string) {
    const config = await this.getAttendanceConfig();
    const currentMonth = zonedDateParts(new Date(), config.timezone).dateKey.slice(0, 7);
    if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month) || month >= currentMonth) {
      throw new BadRequestException('只能结算已经结束的月份。');
    }

    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    if (!user) throw new NotFoundException('用户不存在。');

    const monthRange = monthRangeForDateKey(`${month}-01`);
    const registeredDate = zonedDateParts(user.createdAt, config.timezone).dateKey;
    const startDate = registeredDate > monthRange.startDate ? registeredDate : monthRange.startDate;
    const endDate = monthRange.endDate;
    const dateKeys = startDate <= endDate ? this.enumerateDateKeys(startDate, endDate) : [];
    const [sessions, projections] =
      dateKeys.length > 0
      ? await Promise.all([
        this.prismaService.checkInSession.findMany({
          where: { userId, workDate: { gte: startDate, lte: endDate } },
        }),
        this.loadDailyPresenceProjections(userId, startDate, endDate, config.timezone),
      ])
      : [[], new Map<string, DailyPresenceProjection>()];
    const sessionsByDate = this.groupCheckInSessionsByWorkDate(sessions);
    const days = dateKeys.map((workDate) => {
      const weekday = this.parseWorkDate(workDate, config.timezone).weekday;
      const checkIn = this.summarizeCheckInSessions(workDate, sessionsByDate.get(workDate) ?? []);
      return {
        ...checkIn,
        isWorkday: isCalendarWorkday(workDate, weekday, config.workDays),
        onlineMinutes: projections.get(workDate)?.onlineWorkMinutes ?? 0,
      };
    });
    const expectedWorkDays = days.filter((day) => day.isWorkday).length;
    const targetMinutes = expectedWorkDays * MAX_DAILY_ACTIVE_WORKED_MINUTES;
    const onlineTotalMinutes = days.reduce((sum, day) => sum + day.onlineMinutes, 0);
    const checkInTotalMinutes = days.reduce((sum, day) => sum + day.checkInMinutes, 0);
    const workdayOnlineMinutes = days.reduce(
      (sum, day) => sum + (day.isWorkday ? clampDailyWorkedMinutes(day.onlineMinutes) : 0),
      0,
    );
    const workdayCheckInMinutes = days.reduce(
      (sum, day) => sum + (day.isWorkday ? clampDailyWorkedMinutes(day.checkInMinutes) : 0),
      0,
    );
    const percent = (minutes: number) =>
      targetMinutes > 0 ? Math.round((minutes / targetMinutes) * 100) : null;

    return {
      month,
      timezone: config.timezone,
      targetDailyMinutes: MAX_DAILY_ACTIVE_WORKED_MINUTES,
      range: {
        startDate: monthRange.startDate,
        endDate: monthRange.endDate,
        effectiveStartDate: startDate,
        effectiveEndDate: endDate,
      },
      summary: {
        expectedWorkDays,
        targetMinutes,
        onlineTotalMinutes,
        checkInTotalMinutes,
        onlineCompletionPercent: percent(workdayOnlineMinutes),
        checkInCompletionPercent: percent(workdayCheckInMinutes),
        overallCompletionPercent: percent((workdayOnlineMinutes + workdayCheckInMinutes) / 2),
      },
      days,
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
      return this.getCheckInDayState(
        actor.sub,
        workDate,
        config.timezone,
        result.unchangedSessions,
        now,
      );
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
    const recordStartDate = startDate < currentYearStartDate ? startDate : currentYearStartDate;
    const [panelRecords, dailyProjections] = await Promise.all([
      this.prismaService.checkInSession.findMany({
        where: {
          userId: actor.sub,
          workDate: {
            gte: recordStartDate,
            lte: today,
          },
        },
      }),
      this.loadDailyPresenceProjections(actor.sub, recordStartDate, today, config.timezone),
    ]);
    const records = panelRecords.filter((record) => record.workDate >= startDate);
    const yearRecords = panelRecords.filter((record) => record.workDate >= currentYearStartDate);
    const todaySessions = panelRecords.filter((record) => record.workDate === today);
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
    const statusSeries = dateKeys.map(
      (
        workDate,
      ): {
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
      },
    );

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
        checkInMinutes: this.calculateCheckInMinutes(
          sessions,
          workDate === today ? new Date() : null,
        ),
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
        yearCheckInSeries.map((item) => ({
          workDate: item.workDate,
          minutes: item.checkInMinutes,
        })),
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
        completionRate: statusSeries.length
          ? Math.round((completedDays / statusSeries.length) * 100)
          : 0,
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
    const config = await this.getAttendanceConfig();
    const anchorDate = dateKey || zonedDateParts(new Date(), config.timezone).dateKey;
    const requiredRange = this.getStatsPresenceRange(anchorDate, config.timezone);
    const projectionsByUser = await this.loadDailyPresenceProjectionsForUsers(
      users.map((user) => user.id),
      requiredRange.startDate,
      anchorDate,
      config.timezone,
    );
    const entries = users.map((user) => ({
      user,
      stats: this.buildUserStats(
        anchorDate,
        config,
        projectionsByUser.get(user.id) ?? new Map<string, DailyPresenceProjection>(),
      ),
    }));
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
    const userIds = users.map((user) => user.id);
    const [projectionsByUser, checkInSessions] = await Promise.all([
      this.loadDailyPresenceProjectionsForUsers(userIds, yearStart, today, config.timezone),
      this.prismaService.checkInSession.findMany({
        where: {
          userId: { in: userIds },
          workDate: { gte: yearStart, lte: today },
        },
        select: { userId: true, workDate: true, checkInAt: true, checkOutAt: true },
      }),
    ]);
    const checkInsByUser = new Map<string, typeof checkInSessions>();
    for (const session of checkInSessions) {
      const sessions = checkInsByUser.get(session.userId) ?? [];
      sessions.push(session);
      checkInsByUser.set(session.userId, sessions);
    }
    const dateKeys = this.enumerateDateKeys(yearStart, today);

    const items = users.map((user) => {
      const dailyProjections =
        projectionsByUser.get(user.id) ?? new Map<string, DailyPresenceProjection>();
        const onlineDailyMap = new Map(
          [...dailyProjections].map(([workDate, projection]) => [
            workDate,
            projection.onlineWorkMinutes,
          ]),
        );
      const sessionMap = this.groupCheckInSessionsByWorkDate(checkInsByUser.get(user.id) ?? []);
        const onlineSeries = dateKeys.map((dateKey) => ({
          workDate: dateKey,
          minutes: onlineDailyMap.get(dateKey) ?? 0,
        }));
      const checkInSeries = dateKeys.map((dateKey) => ({
        workDate: dateKey,
        minutes: this.calculateCheckInMinutes(
          sessionMap.get(dateKey) ?? [],
          dateKey === today ? new Date() : null,
        ),
      }));
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
        return {
          user,
          online: {
          todayMinutes: onlineDailyMap.get(today) ?? 0,
            monthAverageMinutes: onlineAverages.monthAverageMinutes,
            totalAverageMinutes: onlineAverages.totalAverageMinutes,
          },
          checkIn: {
          todayMinutes: checkInSeries.find((item) => item.workDate === today)?.minutes ?? 0,
            monthAverageMinutes: checkInAverages.monthAverageMinutes,
            totalAverageMinutes: checkInAverages.totalAverageMinutes,
          },
        };
    });

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

  /**
   * Start the full rebuild without blocking the config request.
   *
   * Derived attendance rows are allowed to lag behind the config by a few
   * seconds; a second request joins the in-flight run instead of duplicating it.
   */
  scheduleRecomputeAllUsers(): { started: boolean } {
    if (this.recomputeAllRun) return { started: false };
    this.recomputeAllRun = this.recomputeAllUsers()
      .catch((error: unknown) => {
        this.logger.error(
          'attendance_recompute_failed',
          error instanceof Error ? (error.stack ?? error.message) : String(error),
        );
      })
      .finally(() => {
        this.recomputeAllRun = null;
      });
    return { started: true };
  }

  getRecomputeStatus(): { running: boolean } {
    return { running: this.recomputeAllRun !== null };
  }

  async recomputeRecentDays(): Promise<void> {
    const config = await this.getAttendanceConfig();
    const recentEvents = await this.prismaService.attendanceActionEvent.findMany({
      where: {
        occurredAt: {
          gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        userId: true,
        occurredAt: true,
      },
      orderBy: { occurredAt: 'desc' },
    });

    const datesByUser = new Map<string, Set<string>>();
    const addDate = (userId: string, dateKey: string) => {
      const dates = datesByUser.get(userId) ?? new Set<string>();
      dates.add(dateKey);
      datesByUser.set(userId, dates);
    };
    for (const event of recentEvents) {
      const dateKey = zonedDateParts(event.occurredAt, config.timezone).dateKey;
      addDate(event.userId, dateKey);
      const activeWindowEnd = new Date(
        event.occurredAt.getTime() + config.activeWindowMinutes * 60_000,
      );
      const activeWindowEndDateKey = zonedDateParts(activeWindowEnd, config.timezone).dateKey;
      if (activeWindowEndDateKey !== dateKey) {
        addDate(event.userId, activeWindowEndDateKey);
      }
    }

    for (const [userId, dates] of datesByUser) {
      await this.recomputeUserDates(userId, [...dates].sort(), config, { pruneStale: false });
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
      const activeWindowEnd = new Date(
        event.occurredAt.getTime() + config.activeWindowMinutes * 60_000,
      );
      const activeWindowEndDateKey = zonedDateParts(activeWindowEnd, config.timezone).dateKey;
      if (activeWindowEndDateKey !== dateKey) {
        dateKeys.add(activeWindowEndDateKey);
      }
    }

    if (!dateKeys.size) {
      await this.prismaService.attendanceDaily.deleteMany({ where: { userId } });
      return;
    }

    await this.recomputeUserDates(userId, [...dateKeys].sort(), config);
  }

  /**
   * Rebuild a set of dates for one user in one transaction.
   *
   * The old path issued a range query and an upsert per user-day. Loading the
   * events once and replacing the derived rows in bulk keeps the write count
   * proportional to the number of dates, not the number of SQL round trips.
   */
  private async recomputeUserDates(
    userId: string,
    dateKeys: string[],
    config: AttendanceConfig,
    options: { pruneStale?: boolean } = {},
  ): Promise<void> {
    if (dateKeys.length === 0) {
      if (options.pruneStale !== false) {
        await this.prismaService.attendanceDaily.deleteMany({ where: { userId } });
      }
      return;
    }

    const minDate = dateKeys[0]!;
    const maxDate = dateKeys[dateKeys.length - 1]!;
    const [existingRows, events] = await Promise.all([
      this.prismaService.attendanceDaily.findMany({
        where: { userId },
        select: { workDate: true },
      }),
      this.prismaService.attendanceActionEvent.findMany({
        where: {
          userId,
          occurredAt: {
            gte: getLocalDayBoundaryUtc(shiftDateKey(minDate, -2), config.timezone),
            lt: getLocalDayBoundaryUtc(shiftDateKey(maxDate, 3), config.timezone),
        },
        },
        orderBy: { occurredAt: 'asc' },
        select: { occurredAt: true },
      }),
    ]);

    const wanted = new Set(dateKeys);
    const eventsByDate = new Map<string, Date[]>();
    for (const event of events) {
      const eventDateKey = zonedDateParts(event.occurredAt, config.timezone).dateKey;
      if (wanted.has(eventDateKey)) {
        const dates = eventsByDate.get(eventDateKey) ?? [];
        dates.push(event.occurredAt);
        eventsByDate.set(eventDateKey, dates);
      }
      const activeWindowEnd = new Date(
        event.occurredAt.getTime() + config.activeWindowMinutes * 60_000,
      );
      const activeWindowEndDateKey = zonedDateParts(activeWindowEnd, config.timezone).dateKey;
      if (activeWindowEndDateKey !== eventDateKey && wanted.has(activeWindowEndDateKey)) {
        const dates = eventsByDate.get(activeWindowEndDateKey) ?? [];
        dates.push(event.occurredAt);
        eventsByDate.set(activeWindowEndDateKey, dates);
    }
  }

    const summaries: AttendanceDailySummary[] = [];
    for (const workDate of dateKeys) {
      const dayEvents = (eventsByDate.get(workDate) ?? []).sort(
        (left, right) => left.getTime() - right.getTime(),
    );
      for (const mode of ATTENDANCE_PROJECTION_MODES) {
        summaries.push(this.buildDailySummary(userId, workDate, config, dayEvents, mode));
      }
  }

    const existingDates = new Set(existingRows.map((row) => row.workDate));
    const staleDates =
      options.pruneStale === false
        ? []
        : [...existingDates].filter((dateKey) => !wanted.has(dateKey));

    await this.prismaService.$transaction(async (transaction) => {
      await transaction.$executeRaw`SET LOCAL synchronous_commit = off`;
      await transaction.attendanceDaily.deleteMany({
        where: { userId, workDate: { in: dateKeys } },
      });
      if (summaries.length > 0) {
        await transaction.attendanceDaily.createMany({ data: summaries });
      }
      if (staleDates.length > 0) {
        await transaction.attendanceDaily.deleteMany({
          where: { userId, workDate: { in: staleDates } },
        });
      }
    });
  }

  private buildDailySummary(
    userId: string,
    workDate: string,
    config: AttendanceConfig,
    dayEventDates: Date[],
    mode: AttendanceMode,
  ): AttendanceDailySummary {
    const dayEvents = dayEventDates.map((occurredAt) => ({ occurredAt }));
    const isWorkDay = config.workDays.includes(weekdayForDateKey(workDate));
      const first = dayEvents[0] ?? null;
      const last = dayEvents[dayEvents.length - 1] ?? null;

    if (mode === AttendanceMode.FLEXIBLE) {
      return {
        userId,
        workDate,
        mode,
        clockInAt: first?.occurredAt ?? null,
        clockOutAt: last?.occurredAt ?? null,
        clockInSource: first ? 'manual_action' : null,
        clockOutSource: last ? 'manual_action' : null,
        clockInMissing: !first,
        clockOutMissing: !last,
        workedMinutes: computeActiveWindowWorkedMinutes(
          dayEventDates,
          workDate,
          config.timezone,
          config.activeWindowMinutes,
        ),
        computedAt: new Date(),
      };
    }

    if (!isWorkDay) {
      return {
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
    }

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
    const firstIn = inEvents[0] ?? null;
    const lastOut = outEvents[outEvents.length - 1] ?? null;
    return {
        userId,
        workDate,
        mode,
      clockInAt: firstIn?.occurredAt ?? null,
      clockOutAt: lastOut?.occurredAt ?? null,
      clockInSource: firstIn ? 'manual_action' : null,
      clockOutSource: lastOut ? 'manual_action' : null,
      clockInMissing: !firstIn,
      clockOutMissing: !lastOut,
      workedMinutes: computeWorkedMinutes(
        mode,
        firstIn?.occurredAt ?? null,
        lastOut?.occurredAt ?? null,
        config.scheduledBreakMinutes,
      ),
        computedAt: new Date(),
      };
    }

  /** Only the weekday is meaningful for a local date key; no timezone formatter needed. */
  private parseWorkDate(workDate: string, _timeZone: string) {
    return { weekday: weekdayForDateKey(workDate) };
  }

  private countInclusiveDays(startDate: string, endDate: string): number {
    const [startYear, startMonth, startDay] = startDate
      .split('-')
      .map((value) => Number.parseInt(value, 10));
    const [endYear, endMonth, endDay] = endDate
      .split('-')
      .map((value) => Number.parseInt(value, 10));
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
  ) {
    const monthRange = monthRangeForDateKey(anchorDate);
    const monthSeries = series.filter(
      (item) => item.workDate >= monthRange.startDate && item.workDate <= anchorDate,
    );
    const yearSeries = series.filter(
      (item) => item.workDate >= `${anchorDate.slice(0, 4)}-01-01` && item.workDate <= anchorDate,
    );

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
      basis: { monthWorkedMinutes, yearWorkedMinutes, monthWorkDays, yearWorkDays },
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
    const sessions =
      prefetchedSessions ??
      (await this.prismaService.checkInSession.findMany({
      where: {
        userId,
        workDate,
      },
      }));
    const online = await this.computeOnlineDurationForUserDate(userId, workDate, timezone);
    const summary = this.summarizeCheckInSessions(workDate, sessions, { now });

    return {
      ...summary,
      onlineMinutes: online.onlineWorkMinutes,
      todaySegments: online.segments,
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

  private groupCheckInSessionsByWorkDate<T extends CheckInSessionLike>(
    sessions: ReadonlyArray<T>,
  ): Map<string, T[]> {
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

  private findLatestOpenSession<T extends CheckInSessionLike>(
    sessions: ReadonlyArray<T>,
  ): T | null {
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
    const validSessions = sessions
      .filter((session) => session.checkInAt)
      .sort((left, right) => {
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
    const latestClosedSession =
      [...validSessions]
      .filter((session) => session.checkOutAt)
        .sort(
          (left, right) => (right.checkOutAt?.getTime() ?? 0) - (left.checkOutAt?.getTime() ?? 0),
        )[0] ?? null;

    return {
      workDate,
      status: openSession ? 'CHECKED_IN' : 'CHECKED_OUT',
      checkInAt: validSessions[0]?.checkInAt?.toISOString() ?? null,
      checkOutAt: openSession ? null : (latestClosedSession?.checkOutAt?.toISOString() ?? null),
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

    return Math.max(
      0,
      Math.floor((session.checkOutAt.getTime() - session.checkInAt.getTime()) / 60_000),
    );
  }

  private async listPresenceWorkDates(timezone: string, userId?: string): Promise<string[]> {
    // Only distinct local dates are needed. Returning every log made this O(rows)
    // in both SQL and JS just to discard all but a few hundred keys.
    const [logDates, summaries] = await Promise.all([
      this.prismaService.$queryRaw<Array<{ workDate: string }>>(
        Prisma.sql`
          SELECT DISTINCT
            to_char(
              (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${timezone})::date,
              'YYYY-MM-DD'
            ) AS "workDate"
          FROM "PresenceLog"
          ${userId ? Prisma.sql`WHERE "userId" = ${userId}` : Prisma.empty}
        `,
      ),
      this.prismaService.presenceDailySummary.findMany({
        where: userId ? { userId } : undefined,
        select: { workDate: true },
      }),
    ]);

    const seen = new Set(summaries.map((summary) => summary.workDate));
    for (const row of logDates) {
      seen.add(row.workDate);
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
  ) {
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
      segments: projection.segments,
    };
  }

  private async loadDailyPresenceProjections(
    userId: string,
    startDate: string,
    endDate: string,
    timezone: string,
  ): Promise<Map<string, DailyPresenceProjection>> {
    const byUser = await this.loadDailyPresenceProjectionsForUsers(
      [userId],
      startDate,
      endDate,
      timezone,
    );
    return byUser.get(userId) ?? new Map<string, DailyPresenceProjection>();
  }

  /**
   * Batch form of `loadDailyPresenceProjections`.
   *
   * The admin views need every user's year. Issuing four queries per user made
   * the endpoint O(users) in round trips; one query per relation is enough.
   */
  private async loadDailyPresenceProjectionsForUsers(
    userIds: string[],
    startDate: string,
    endDate: string,
    timezone: string,
  ): Promise<Map<string, Map<string, DailyPresenceProjection>>> {
    const result = new Map<string, Map<string, DailyPresenceProjection>>();
    if (userIds.length === 0) return result;

    const rangeStart = getLocalDayBoundaryUtc(startDate, timezone);
    const rangeEnd = getLocalDayBoundaryUtc(shiftDateKey(endDate, 1), timezone);
    const [previousLogs, previousSummaries, rangeLogs, summaries] = await Promise.all([
      Promise.all(
        userIds.map((userId) =>
      this.prismaService.presenceLog.findFirst({
            where: { userId, createdAt: { lt: rangeStart } },
        orderBy: { createdAt: 'desc' },
            select: { createdAt: true, isOnline: true, isDnd: true },
      }),
        ),
      ),
      Promise.all(
        userIds.map((userId) =>
      this.prismaService.presenceDailySummary.findFirst({
        where: { userId, workDate: { lt: startDate } },
        orderBy: { workDate: 'desc' },
        select: { endIsOnline: true, endIsDnd: true },
      }),
        ),
      ),
      this.prismaService.presenceLog.findMany({
        where: {
          userId: { in: userIds },
          createdAt: { gte: rangeStart, lt: rangeEnd },
        },
        orderBy: { createdAt: 'asc' },
        select: { userId: true, createdAt: true, isOnline: true, isDnd: true },
      }),
      this.prismaService.presenceDailySummary.findMany({
        where: { userId: { in: userIds }, workDate: { gte: startDate, lte: endDate } },
        orderBy: { workDate: 'asc' },
      }),
    ]);

    const previousLogByUser = new Map<
      string,
      { createdAt: Date; isOnline: boolean; isDnd: boolean }
    >();
    const previousSummaryByUser = new Map<string, { endIsOnline: boolean; endIsDnd: boolean }>();
    userIds.forEach((userId, index) => {
      const previousLog = previousLogs[index];
      if (previousLog) previousLogByUser.set(userId, previousLog);
      const previousSummary = previousSummaries[index];
      if (previousSummary) previousSummaryByUser.set(userId, previousSummary);
    });
    const logsByUser = new Map<
      string,
      Array<{ createdAt: Date; isOnline: boolean; isDnd: boolean }>
    >();
    for (const log of rangeLogs) {
      const logs = logsByUser.get(log.userId) ?? [];
      logs.push({ createdAt: log.createdAt, isOnline: log.isOnline, isDnd: log.isDnd });
      logsByUser.set(log.userId, logs);
    }
    const summariesByUser = new Map<string, typeof summaries>();
    for (const summary of summaries) {
      const userSummaries = summariesByUser.get(summary.userId) ?? [];
      userSummaries.push(summary);
      summariesByUser.set(summary.userId, userSummaries);
    }

    for (const userId of userIds) {
      const previousLog = previousLogByUser.get(userId);
      const previousSummary = previousSummaryByUser.get(userId);
      const previous =
        previousLog ??
        (previousSummary
          ? {
      createdAt: new Date(rangeStart.getTime() - 1),
      isOnline: previousSummary.endIsOnline,
      isDnd: previousSummary.endIsDnd,
            }
          : null);
      const userSummaries = summariesByUser.get(userId) ?? [];
      const summaryBoundaries = userSummaries.map((summary) => ({
        createdAt: new Date(
          getLocalDayBoundaryUtc(shiftDateKey(summary.workDate, 1), timezone).getTime() - 1,
        ),
      isOnline: summary.endIsOnline,
      isDnd: summary.endIsDnd,
    }));
      const userLogs = logsByUser.get(userId) ?? [];
    const logs = previous
        ? [previous, ...userLogs, ...summaryBoundaries]
        : [...userLogs, ...summaryBoundaries];

    const projections = this.projections.projectDailyPresence(logs, startDate, endDate, timezone);
      for (const summary of userSummaries) {
      projections.set(summary.workDate, {
        firstOnlineAt: summary.firstOnlineAt,
        lastOnlineAt: summary.lastOnlineAt,
        onlineWorkMinutes: summary.onlineWorkMinutes,
        segments: [],
      });
    }
      result.set(userId, projections);
    }

    return result;
  }

  private getStatsPresenceRange(anchorDate: string, timezone: string): { startDate: string } {
    const weekRange = weekRangeForDateKey(anchorDate, timezone);
    const monthRange = monthRangeForDateKey(anchorDate);
    const previousDate = shiftDateKey(anchorDate, -1);
    return {
      startDate:
        [weekRange.startDate, monthRange.startDate, previousDate].sort()[0] ?? previousDate,
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
    return Math.max(7, Math.min(Math.trunc(days), 365));
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
