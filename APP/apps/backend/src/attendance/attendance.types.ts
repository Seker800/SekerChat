import { AttendanceMode } from '@prisma/client';

export type AttendanceConfig = {
  timezone: string;
  clockInStart: string;
  clockInEnd: string;
  clockOutStart: string;
  clockOutEnd: string;
  workDays: number[];
  scheduledBreakMinutes: number;
  activeWindowMinutes: number;
};

export type AttendanceDailySummary = {
  userId: string;
  workDate: string;
  mode: AttendanceMode;
  clockInAt: Date | null;
  clockOutAt: Date | null;
  clockInSource: string | null;
  clockOutSource: string | null;
  clockInMissing: boolean;
  clockOutMissing: boolean;
  workedMinutes: number | null;
  computedAt: Date;
};

export type OnlineDurationSummary = {
  firstOnlineAt: Date | null;
  lastOnlineAt: Date | null;
  onlineWorkMinutes: number;
};

export type OnlineSegmentSummary = {
  startAt: Date;
  endAt: Date;
  isOnline: boolean;
  isDnd: boolean;
  countedMinutes: number;
};

export type CheckInStatus = 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT';
