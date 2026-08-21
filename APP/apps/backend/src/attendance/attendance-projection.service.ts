import { Injectable } from '@nestjs/common';
import type { OnlineDurationSummary, OnlineSegmentSummary } from './attendance.types';
import {
  clampDailyWorkedMinutes,
  getLocalDayBoundaryUtc,
  shiftDateKey,
  zonedDateParts,
} from './attendance.utils';

export type PresenceSnapshot = {
  createdAt: Date;
  isOnline: boolean;
  isDnd: boolean;
};

export type DailyPresenceProjection = OnlineDurationSummary & {
  segments: OnlineSegmentSummary[];
};

@Injectable()
export class AttendanceProjectionService {
  empty(): DailyPresenceProjection {
    return {
      firstOnlineAt: null,
      lastOnlineAt: null,
      onlineWorkMinutes: 0,
      segments: [],
    };
  }

  projectDailyPresence(
    logs: ReadonlyArray<PresenceSnapshot>,
    startDate: string,
    endDate: string,
    timezone: string,
  ): Map<string, DailyPresenceProjection> {
    const result = new Map<string, DailyPresenceProjection>();
    const dateKeys = enumerateDateKeys(startDate, endDate);
    let lastOnline = false;
    let lastDnd = false;
    const logsByDate = new Map<string, PresenceSnapshot[]>();
    const sortedLogs = [...logs].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );

    for (const log of sortedLogs) {
      const dateKey = zonedDateParts(log.createdAt, timezone).dateKey;
      if (dateKey < startDate) {
        lastOnline = log.isOnline;
        lastDnd = log.isDnd;
        continue;
      }
      if (dateKey <= endDate) {
        const bucket = logsByDate.get(dateKey) ?? [];
        bucket.push(log);
        logsByDate.set(dateKey, bucket);
      }
    }

    for (const dateKey of dateKeys) {
      const dayLogs = logsByDate.get(dateKey) ?? [];
      const dayStart = getLocalDayBoundaryUtc(dateKey, timezone);
      const dayEnd = getLocalDayBoundaryUtc(shiftDateKey(dateKey, 1), timezone);
      const now = new Date();
      const todayDateKey = zonedDateParts(now, timezone).dateKey;
      const effectiveDayEnd = dateKey === todayDateKey && now < dayEnd ? now : dayEnd;
      let currentOnline = lastOnline;
      let currentDnd = lastDnd;
      let cursor = dayStart;
      const segments: OnlineSegmentSummary[] = [];

      for (const log of dayLogs) {
        if (log.createdAt > cursor) {
          const durationMinutes = Math.max(
            0,
            Math.floor((log.createdAt.getTime() - cursor.getTime()) / 60_000),
          );
          if (durationMinutes > 0) {
            segments.push({
              startAt: cursor,
              endAt: log.createdAt,
              isOnline: currentOnline,
              isDnd: currentDnd,
              countedMinutes: currentOnline && !currentDnd ? durationMinutes : 0,
            });
          }
        }
        currentOnline = log.isOnline;
        currentDnd = log.isDnd;
        cursor = log.createdAt;
      }

      if (effectiveDayEnd > cursor) {
        const durationMinutes = Math.max(
          0,
          Math.floor((effectiveDayEnd.getTime() - cursor.getTime()) / 60_000),
        );
        if (durationMinutes > 0) {
          segments.push({
            startAt: cursor,
            endAt: effectiveDayEnd,
            isOnline: currentOnline,
            isDnd: currentDnd,
            countedMinutes: currentOnline && !currentDnd ? durationMinutes : 0,
          });
        }
      }

      const mergedSegments = mergeAdjacentSegments(segments);
      const onlineSegments = mergedSegments.filter((segment) => segment.isOnline);
      result.set(dateKey, {
        firstOnlineAt: onlineSegments[0]?.startAt ?? null,
        lastOnlineAt: onlineSegments[onlineSegments.length - 1]?.endAt ?? null,
        onlineWorkMinutes: clampDailyWorkedMinutes(
          mergedSegments.reduce((sum, segment) => sum + segment.countedMinutes, 0),
        ),
        segments: mergedSegments,
      });
      lastOnline = currentOnline;
      lastDnd = currentDnd;
    }

    return result;
  }
}

function enumerateDateKeys(startDate: string, endDate: string): string[] {
  const result: string[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    result.push(cursor);
    cursor = shiftDateKey(cursor, 1);
  }
  return result;
}

function mergeAdjacentSegments(segments: OnlineSegmentSummary[]): OnlineSegmentSummary[] {
  if (segments.length <= 1) return segments;

  const merged: OnlineSegmentSummary[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous && previous.isOnline === segment.isOnline && previous.isDnd === segment.isDnd) {
      previous.endAt = segment.endAt;
      previous.countedMinutes += segment.countedMinutes;
      continue;
    }
    merged.push({ ...segment });
  }
  return merged;
}
