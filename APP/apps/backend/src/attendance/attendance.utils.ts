import { AttendanceMode } from '@prisma/client';
import type { AttendanceConfig } from './attendance.types';

const DEFAULT_TIMEZONE = 'Asia/Shanghai';
export const MAX_DAILY_ACTIVE_WORKED_MINUTES = 480;

export function clampDailyWorkedMinutes(minutes: number): number {
  return Math.min(Math.max(0, minutes), MAX_DAILY_ACTIVE_WORKED_MINUTES);
}

export function getDefaultAttendanceConfig(): AttendanceConfig {
  return {
    timezone: DEFAULT_TIMEZONE,
    clockInStart: '08:00',
    clockInEnd: '10:00',
    clockOutStart: '16:00',
    clockOutEnd: '19:00',
    workDays: [1, 2, 3, 4, 5],
    scheduledBreakMinutes: 60,
    activeWindowMinutes: 120,
  };
}

export function parseAttendanceConfig(raw: Record<string, string>): AttendanceConfig {
  const defaults = getDefaultAttendanceConfig();
  return {
    timezone: raw.attendanceTimezone || defaults.timezone,
    clockInStart: raw.attendanceClockInStart || defaults.clockInStart,
    clockInEnd: raw.attendanceClockInEnd || defaults.clockInEnd,
    clockOutStart: raw.attendanceClockOutStart || defaults.clockOutStart,
    clockOutEnd: raw.attendanceClockOutEnd || defaults.clockOutEnd,
    workDays: parseWorkDays(raw.attendanceWorkDays) ?? defaults.workDays,
    scheduledBreakMinutes: parsePositiveInt(
      raw.attendanceScheduledBreakMinutes,
      defaults.scheduledBreakMinutes,
    ),
    activeWindowMinutes: parsePositiveInt(
      raw.attendanceActiveWindowMinutes,
      defaults.activeWindowMinutes,
    ),
  };
}

export function parseAttendanceMode(raw: string | null | undefined): AttendanceMode {
  return raw === 'FLEXIBLE' ? AttendanceMode.FLEXIBLE : AttendanceMode.SCHEDULED;
}

export function parseWorkDays(raw: string | undefined): number[] | null {
  if (!raw) return null;
  const values = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  return values.length ? [...new Set(values)] : null;
}

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw || '', 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const WEEKDAY_BY_NAME: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Timezone-aware formatting is a formatter construction per call if left inline.
// Production has a handful of zones; keep the cache small and explicit.
const DATE_TIME_FORMATTER_CACHE_LIMIT = 8;
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dateTimeFormatters.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  if (dateTimeFormatters.size >= DATE_TIME_FORMATTER_CACHE_LIMIT) {
    const oldest = dateTimeFormatters.keys().next().value;
    if (oldest !== undefined) dateTimeFormatters.delete(oldest);
  }
  dateTimeFormatters.set(timeZone, formatter);
  return formatter;
}

/** Weekday of a local calendar date. Independent of the timezone. */
export function weekdayForDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function zonedDateParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hours: number;
  minutes: number;
  seconds: number;
  dateKey: string;
} {
  const parts = dateTimeFormatter(timeZone).formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let weekday = 0;
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  for (const part of parts) {
    switch (part.type) {
      case 'year':
        year = Number(part.value);
        break;
      case 'month':
        month = Number(part.value);
        break;
      case 'day':
        day = Number(part.value);
        break;
      case 'weekday':
        weekday = WEEKDAY_BY_NAME[part.value] ?? 0;
        break;
      case 'hour':
        hours = Number(part.value);
        break;
      case 'minute':
        minutes = Number(part.value);
        break;
      case 'second':
        seconds = Number(part.value);
        break;
      default:
        break;
    }
  }

  return {
    year,
    month,
    day,
    weekday,
    hours,
    minutes,
    seconds,
    dateKey: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

export function localMinutes(date: Date, timeZone: string): number {
  const parts = zonedDateParts(date, timeZone);
  return parts.hours * 60 + parts.minutes;
}

export function shiftDateKey(dateKey: string, offsetDays: number): string {
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  const shifted = new Date(Date.UTC(year, month - 1, day + offsetDays, 12, 0, 0));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function weekRangeForDateKey(
  dateKey: string,
  _timeZone: string,
): { startDate: string; endDate: string } {
  const startDate = shiftDateKey(dateKey, -((weekdayForDateKey(dateKey) + 6) % 7));
  const endDate = shiftDateKey(startDate, 6);
  return { startDate, endDate };
}

export function monthRangeForDateKey(dateKey: string): { startDate: string; endDate: string } {
  const [year, month] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  const startDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0, 12, 0, 0));
  const endDate = `${monthEnd.getUTCFullYear()}-${String(monthEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(monthEnd.getUTCDate()).padStart(2, '0')}`;
  return { startDate, endDate };
}

export function timeStringToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

export function computeActiveWindowWorkedMinutes(
  occurredAtDates: Date[],
  workDate: string,
  timeZone: string,
  activeWindowMinutes: number,
): number {
  if (!occurredAtDates.length || activeWindowMinutes <= 0) {
    return 0;
  }

  const sortedDates = [...occurredAtDates].sort((a, b) => a.getTime() - b.getTime());
  const dayStart = getLocalDayBoundaryUtc(workDate, timeZone);
  const dayEnd = getLocalDayBoundaryUtc(shiftDateKey(workDate, 1), timeZone);
  const activeWindowMs = activeWindowMinutes * 60_000;
  const mergedWindows: Array<{ startMs: number; endMs: number }> = [];

  for (const occurredAt of sortedDates) {
    const rawStartMs = occurredAt.getTime();
    const rawEndMs = rawStartMs + activeWindowMs;
    const startMs = Math.max(rawStartMs, dayStart.getTime());
    const endMs = Math.min(rawEndMs, dayEnd.getTime());
    if (endMs <= startMs) {
      continue;
    }

    const last = mergedWindows[mergedWindows.length - 1];
    if (last && startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, endMs);
    } else {
      mergedWindows.push({ startMs, endMs });
    }
  }

  const workedMinutes = mergedWindows.reduce(
    (total, window) => total + Math.floor((window.endMs - window.startMs) / 60_000),
    0,
  );

  return clampDailyWorkedMinutes(workedMinutes);
}

export function getLocalDayBoundaryUtc(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  const utcProbe = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  const parts = zonedDateParts(utcProbe, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hours,
    parts.minutes,
    parts.seconds,
  );
  const desiredAsUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  return new Date(utcProbe.getTime() + (desiredAsUtc - localAsUtc));
}

export function computeWorkedMinutes(
  mode: AttendanceMode,
  clockInAt: Date | null,
  clockOutAt: Date | null,
  scheduledBreakMinutes: number,
): number | null {
  if (!clockInAt || !clockOutAt) {
    return null;
  }

  const rawMinutes = Math.floor((clockOutAt.getTime() - clockInAt.getTime()) / 60_000);
  if (rawMinutes < 0) {
    return null;
  }

  if (mode === AttendanceMode.SCHEDULED) {
    return Math.max(0, rawMinutes - scheduledBreakMinutes);
  }

  return rawMinutes;
}
