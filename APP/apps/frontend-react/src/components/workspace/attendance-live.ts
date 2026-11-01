import type {
  AttendancePanelResponse,
  CheckInPanelResponse,
  CheckInTodayResponse,
  AttendanceAverages,
} from '../../lib/attendance-api';

function advanceAverage(average: AttendanceAverages, delta: number): AttendanceAverages {
  if (!average.basis) return average;
  const { monthWorkedMinutes, yearWorkedMinutes, monthWorkDays, yearWorkDays } = average.basis;
  return {
    ...average,
    monthAverageMinutes: Math.round(
      Math.max(0, monthWorkedMinutes + delta) / Math.max(1, monthWorkDays),
    ),
    totalAverageMinutes: Math.round(
      Math.max(0, yearWorkedMinutes + delta) / Math.max(1, yearWorkDays),
    ),
  };
}

/** Project a small authoritative today snapshot over the immutable history snapshot. */
export function mergeLiveAttendance(
  online: AttendancePanelResponse | undefined,
  checkIn: CheckInPanelResponse | undefined,
  live: CheckInTodayResponse | undefined,
) {
  if (!live || !checkIn || checkIn.today.workDate !== live.workDate) return { online, checkIn };
  const onlineDelta = live.onlineMinutes - checkIn.today.onlineMinutes;
  const checkInDelta = live.checkInMinutes - checkIn.today.checkInMinutes;
  const statusSeries = checkIn.statusSeries.map((day) =>
    day.workDate === live.workDate ? { ...day, ...live } : day,
  );
  const checkedInDays = statusSeries.filter((day) => day.status !== 'NOT_CHECKED_IN').length;
  const completedDays = statusSeries.filter((day) => day.status === 'CHECKED_OUT').length;
  let consecutiveCheckInDays = 0;
  for (const day of [...statusSeries].reverse()) {
    if (day.status === 'NOT_CHECKED_IN') break;
    consecutiveCheckInDays++;
  }
  return {
    online: online
      ? {
          ...online,
          summary: { ...online.summary, dayWorkedMinutes: live.onlineMinutes },
          todaySegments: live.todaySegments ?? online.todaySegments,
          dailySeries: online.dailySeries.map((day) =>
            day.workDate === live.workDate ? { ...day, onlineMinutes: live.onlineMinutes } : day,
          ),
        }
      : online,
    checkIn: {
      ...checkIn,
      today: live,
      summary: {
        ...checkIn.summary,
        checkedInDays,
        completedDays,
        consecutiveCheckInDays,
        completionRate: statusSeries.length
          ? Math.round((completedDays / statusSeries.length) * 100)
          : 0,
        onlineTodayMinutes: live.onlineMinutes,
        averages: {
          online: advanceAverage(checkIn.summary.averages.online, onlineDelta),
          checkIn: advanceAverage(checkIn.summary.averages.checkIn, checkInDelta),
        },
      },
      statusSeries,
      recentRecords: checkIn.recentRecords.map((day) =>
        day.workDate === live.workDate ? { ...day, ...live } : day,
      ),
      onlineSeries: checkIn.onlineSeries.map((day) =>
        day.workDate === live.workDate ? { ...day, onlineMinutes: live.onlineMinutes } : day,
      ),
      checkInSeries: checkIn.checkInSeries.map((day) =>
        day.workDate === live.workDate ? { ...day, checkInMinutes: live.checkInMinutes } : day,
      ),
    },
  };
}
