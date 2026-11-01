import { describe, expect, it } from 'vitest';
import { mergeLiveAttendance } from './attendance-live';
import type { CheckInPanelResponse, AttendancePanelResponse } from '../../lib/attendance-api';

describe('live attendance projection', () => {
  it('updates today and averages without replacing historical records', () => {
    const day = '2026-11-02';
    const historical = { workDate: '2026-11-01', onlineMinutes: 100 };
    const basis = {
      monthWorkedMinutes: 120,
      yearWorkedMinutes: 320,
      monthWorkDays: 2,
      yearWorkDays: 4,
    };
    const checkIn = {
      today: { workDate: day, checkInMinutes: 20, onlineMinutes: 20 },
      summary: { averages: { online: { basis }, checkIn: { basis } } },
      checkInSeries: [{ workDate: day, checkInMinutes: 20 }],
      onlineSeries: [historical, { workDate: day, onlineMinutes: 20 }],
      statusSeries: [{ workDate: day, status: 'CHECKED_IN' }],
      recentRecords: [{ workDate: day, status: 'CHECKED_IN' }],
    } as unknown as CheckInPanelResponse;
    const online = {
      summary: { dayWorkedMinutes: 20 },
      dailySeries: [historical, { workDate: day, onlineMinutes: 20 }],
    } as AttendancePanelResponse;
    const live = {
      workDate: day,
      status: 'CHECKED_OUT' as const,
      checkInAt: null,
      checkOutAt: null,
      checkInMinutes: 40,
      onlineMinutes: 60,
      todaySegments: [],
    };
    const result = mergeLiveAttendance(online, checkIn, live);
    expect(result.online!.summary.dayWorkedMinutes).toBe(60);
    expect(result.checkIn!.summary.averages.online).toMatchObject({
      monthAverageMinutes: 80,
      totalAverageMinutes: 90,
    });
    expect(result.checkIn!.summary.averages.checkIn).toMatchObject({
      monthAverageMinutes: 70,
      totalAverageMinutes: 85,
    });
    expect(result.checkIn!.today.status).toBe('CHECKED_OUT');
    expect(result.checkIn!.onlineSeries[0]).toBe(historical);
    expect(checkIn.checkInSeries[0].checkInMinutes).toBe(20);
  });
});

it('does not mix a new workday into an old historical snapshot', () => {
  const history = { today: { workDate: '2026-11-01' } } as CheckInPanelResponse;
  const live = {
    workDate: '2026-11-02',
  } as import('../../lib/attendance-api').CheckInTodayResponse;
  expect(mergeLiveAttendance(undefined, history, live).checkIn).toBe(history);
});

it('keeps legacy averages available when history lacks the additive basis fields', () => {
  const average = { monthAverageMinutes: 5, totalAverageMinutes: 5 };
  const history = {
    today: { workDate: '2026-11-01', onlineMinutes: 0, checkInMinutes: 0 },
    summary: { averages: { online: average, checkIn: average } },
    statusSeries: [],
    recentRecords: [],
    onlineSeries: [],
    checkInSeries: [],
  } as unknown as CheckInPanelResponse;
  const live = {
    ...history.today,
    status: 'NOT_CHECKED_IN' as const,
    checkInAt: null,
    checkOutAt: null,
  };
  const result = mergeLiveAttendance(undefined, history, live);
  expect(result.online).toBeUndefined();
  expect(result.checkIn?.summary.averages.online).toBe(average);
  expect(result.checkIn?.summary.completionRate).toBe(0);
});
