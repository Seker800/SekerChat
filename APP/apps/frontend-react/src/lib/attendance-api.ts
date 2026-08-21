import { fetchApi,  apiBaseUrl, authHeaders, bearerHeader, parseResponse } from './api-core';
import type { SystemConfig } from './system-config-api';

export type AttendanceMode = 'SCHEDULED' | 'FLEXIBLE';

export interface AttendanceDailyItem {
  id: string;
  userId: string;
  workDate: string;
  mode: AttendanceMode;
  clockInAt: string | null;
  clockOutAt: string | null;
  clockInSource: string | null;
  clockOutSource: string | null;
  clockInMissing: boolean;
  clockOutMissing: boolean;
  workedMinutes: number | null;
  computedAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
}

export interface AttendanceDailyResponse {
  items: AttendanceDailyItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface AttendanceUserModeItem {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  attendanceMode: AttendanceMode;
}

export interface AttendanceUserStats {
  workDate: string;
  mode: AttendanceMode;
  firstOnlineAt?: string | null;
  lastOnlineAt?: string | null;
  dayWorkedMinutes: number | null;
  previousWorkDate: string;
  previousDayWorkedMinutes: number | null;
  weekWorkedMinutes: number;
  monthWorkedMinutes: number;
  weekAverageDailyWorkedMinutes: number;
  monthAverageDailyWorkedMinutes: number;
  weekStartDate: string;
  weekEndDate: string;
  monthStartDate: string;
  monthEndDate: string;
}

export interface AttendancePanelDay {
  workDate: string;
  onlineMinutes: number;
}

export interface AttendancePanelSegment {
  startAt: string;
  endAt: string;
  isOnline: boolean;
  isDnd: boolean;
  countedMinutes: number;
}

export interface AttendancePanelResponse {
  summary: AttendanceUserStats;
  dailySeries: AttendancePanelDay[];
  todaySegments: AttendancePanelSegment[];
  range: {
    startDate: string;
    endDate: string;
    days: number;
  };
}

export interface CheckInTodayResponse {
  workDate: string;
  status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT';
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInMinutes: number;
  onlineMinutes: number;
}

export interface CheckInPanelSeriesItem {
  workDate: string;
  status: 'NOT_CHECKED_IN' | 'CHECKED_IN' | 'CHECKED_OUT';
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface CheckInPanelDay {
  workDate: string;
  checkInMinutes: number;
}

export interface CheckInPanelResponse {
  today: CheckInTodayResponse;
  summary: {
    checkedInDays: number;
    completedDays: number;
    completionRate: number;
    consecutiveCheckInDays: number;
    onlineTodayMinutes: number;
    averages: {
      online: {
        monthAverageMinutes: number;
        totalAverageMinutes: number;
      };
      checkIn: {
        monthAverageMinutes: number;
        totalAverageMinutes: number;
      };
    };
  };
  statusSeries: CheckInPanelSeriesItem[];
  recentRecords: CheckInPanelSeriesItem[];
  checkInSeries: CheckInPanelDay[];
  onlineSeries: AttendancePanelDay[];
  range: {
    startDate: string;
    endDate: string;
    days: number;
  };
}

export interface AttendanceUserStatsItem {
  user: AttendanceUserModeItem;
  stats: AttendanceUserStats;
}

export interface AttendanceUserStatsResponse {
  items: AttendanceUserStatsItem[];
  total: number;
}

export async function fetchAttendanceDaily(
  accessToken: string,
  query: {
    limit?: number;
    offset?: number;
    userId?: string;
    workDate?: string;
    mode?: AttendanceMode;
  } = {},
): Promise<AttendanceDailyResponse> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  if (query.userId) params.set('userId', query.userId);
  if (query.workDate) params.set('workDate', query.workDate);
  if (query.mode) params.set('mode', query.mode);
  const response = await fetchApi(`${apiBaseUrl}/attendance/daily${params.size ? `?${params}` : ''}`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<AttendanceDailyResponse>(response);
}

export interface UserAttendanceAverage {
  todayMinutes: number;
  monthAverageMinutes: number;
  totalAverageMinutes: number;
}

export interface UserAttendanceAveragesItem {
  user: AttendanceUserModeItem;
  online: UserAttendanceAverage;
  checkIn: UserAttendanceAverage;
}

export interface UserAttendanceAveragesResponse {
  items: UserAttendanceAveragesItem[];
  total: number;
}

export async function fetchAttendanceUsersAverages(
  accessToken: string,
): Promise<UserAttendanceAveragesResponse> {
  const response = await fetchApi(`${apiBaseUrl}/attendance/users/averages`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<UserAttendanceAveragesResponse>(response);
}

export async function fetchAttendanceUsersStats(accessToken: string, workDate?: string): Promise<AttendanceUserStatsResponse> {
  const params = new URLSearchParams();
  if (workDate) {
    params.set('workDate', workDate);
  }
  const response = await fetchApi(`${apiBaseUrl}/attendance/users/stats${params.size ? `?${params}` : ''}`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<AttendanceUserStatsResponse>(response);
}

export async function fetchOwnAttendanceStats(
  accessToken: string,
  workDate?: string,
): Promise<AttendanceUserStats> {
  const params = new URLSearchParams();
  if (workDate) {
    params.set('workDate', workDate);
  }
  const response = await fetchApi(`${apiBaseUrl}/attendance/me/stats${params.size ? `?${params}` : ''}`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<AttendanceUserStats>(response);
}

export async function fetchOwnAttendancePanel(
  accessToken: string,
  days = 30,
): Promise<AttendancePanelResponse> {
  const params = new URLSearchParams();
  params.set('days', String(days));
  const response = await fetchApi(`${apiBaseUrl}/attendance/me/panel?${params.toString()}`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<AttendancePanelResponse>(response);
}

export async function fetchOwnCheckInToday(accessToken: string): Promise<CheckInTodayResponse> {
  const response = await fetchApi(`${apiBaseUrl}/attendance/me/checkin/today`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<CheckInTodayResponse>(response);
}

export async function checkIn(accessToken: string): Promise<CheckInTodayResponse> {
  const response = await fetchApi(`${apiBaseUrl}/attendance/me/checkin`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseResponse<CheckInTodayResponse>(response);
}

export async function checkOut(accessToken: string): Promise<CheckInTodayResponse> {
  const response = await fetchApi(`${apiBaseUrl}/attendance/me/checkout`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseResponse<CheckInTodayResponse>(response);
}

export async function resetOwnCheckInTodayForDev(
  accessToken: string,
): Promise<{ workDate: string; deletedCount: number }> {
  const response = await fetchApi(`${apiBaseUrl}/attendance/me/checkin/dev/reset-today`, {
    method: 'POST',
    headers: authHeaders(accessToken),
  });
  return parseResponse<{ workDate: string; deletedCount: number }>(response);
}

export async function fetchOwnCheckInPanel(
  accessToken: string,
  days = 30,
): Promise<CheckInPanelResponse> {
  const params = new URLSearchParams();
  params.set('days', String(days));
  const response = await fetchApi(`${apiBaseUrl}/attendance/me/checkin/panel?${params.toString()}`, {
    headers: bearerHeader(accessToken),
  });
  return parseResponse<CheckInPanelResponse>(response);
}

export async function updateAttendanceConfig(
  accessToken: string,
  config: Partial<SystemConfig>,
): Promise<Record<string, string>> {
  const response = await fetchApi(`${apiBaseUrl}/attendance/config`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify(config),
  });
  return parseResponse<Record<string, string>>(response);
}
