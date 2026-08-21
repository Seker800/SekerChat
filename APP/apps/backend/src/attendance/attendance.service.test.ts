import 'reflect-metadata';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { AttendanceMode } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { CheckInCommandService } from './check-in-command.service';
import { AttendanceActionRecorder } from './attendance-action-recorder.service';
import { AttendanceProjectionService } from './attendance-projection.service';
import { AttendanceQueryService } from './attendance-query.service';
import { clampDailyWorkedMinutes, computeActiveWindowWorkedMinutes, computeWorkedMinutes } from './attendance.utils';

test('scheduled attendance subtracts configured break minutes', () => {
  const clockInAt = new Date('2026-05-12T01:00:00.000Z');
  const clockOutAt = new Date('2026-05-12T10:00:00.000Z');

  const worked = computeWorkedMinutes(AttendanceMode.SCHEDULED, clockInAt, clockOutAt, 60);

  assert.equal(worked, 480);
});

test('flexible attendance keeps full duration without scheduled break deduction', () => {
  const clockInAt = new Date('2026-05-12T01:00:00.000Z');
  const clockOutAt = new Date('2026-05-12T10:00:00.000Z');

  const worked = computeWorkedMinutes(AttendanceMode.FLEXIBLE, clockInAt, clockOutAt, 60);

  assert.equal(worked, 540);
});

test('active window attendance extends continuous operation windows without using first-last span', () => {
  const events = [
    new Date('2026-05-12T01:00:00.000Z'),
    new Date('2026-05-12T02:30:00.000Z'),
    new Date('2026-05-12T07:00:00.000Z'),
  ];

  const worked = computeActiveWindowWorkedMinutes(events, '2026-05-12', 'Asia/Shanghai', 120);

  assert.equal(worked, 330);
});

test('daily worked minutes clamp to 8 hours', () => {
  assert.equal(clampDailyWorkedMinutes(510), 480);
  assert.equal(clampDailyWorkedMinutes(-15), 0);
});

test('getUserStats counts only online time while dnd is off', async () => {
  const service = createAttendanceService({
    presenceLogs: [
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-12T01:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-12T03:00:00.000Z'),
        isOnline: true,
        isDnd: true,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-12T04:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-12T05:00:00.000Z'),
        isOnline: false,
        isDnd: false,
      },
    ],
  });

  const stats = await service.getUserStats('user-1', '2026-05-12');

  assert.equal(stats.mode, AttendanceMode.FLEXIBLE);
  assert.equal(stats.dayWorkedMinutes, 180);
});

test('getUserStats averages over configured workdays instead of natural days', async () => {
  const service = createAttendanceService({
    presenceLogs: [
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-11T01:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-11T03:00:00.000Z'),
        isOnline: false,
        isDnd: false,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-12T01:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-12T03:00:00.000Z'),
        isOnline: false,
        isDnd: false,
      },
    ],
  });

  const stats = await service.getUserStats('user-1', '2026-05-12');

  assert.equal(stats.weekWorkedMinutes, 240);
  assert.equal(stats.weekAverageDailyWorkedMinutes, 120);
});

test('getUserStats respects holiday calendar overrides for workday averages', async () => {
  const service = createAttendanceService({
    presenceLogs: [
      {
        userId: 'user-1',
        createdAt: new Date('2026-02-14T01:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-02-14T03:00:00.000Z'),
        isOnline: false,
        isDnd: false,
      },
    ],
  });

  const stats = await service.getUserStats('user-1', '2026-02-14');

  // 2026-02-14 is a makeup work Saturday and counts as a workday.
  // 2026-02-09..2026-02-14 therefore contributes 6 workdays instead of the fallback 5.
  assert.equal(stats.weekWorkedMinutes, 120);
  assert.equal(stats.weekAverageDailyWorkedMinutes, 20);
});

test('getOwnCheckInPanel month and total averages use projected workdays from first data day', async () => {
  const service = createAttendanceService({
    presenceLogs: [
      {
        userId: 'user-1',
        createdAt: new Date('2026-07-01T01:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-07-01T03:00:00.000Z'),
        isOnline: false,
        isDnd: false,
      },
    ],
    checkInSessions: [
      {
        id: 'session-1',
        userId: 'user-1',
        workDate: '2026-07-01',
        checkInAt: new Date('2026-07-01T01:00:00.000Z'),
        checkOutAt: new Date('2026-07-01T02:00:00.000Z'),
      },
    ],
  });
  const panel = await withMockedNow('2026-07-01T04:00:00.000Z', () =>
    service.getOwnCheckInPanel({ sub: 'user-1', role: 'MEMBER' } as any, 30),
  );

  // Mock date is 2026-07-01, so denominator counts workdays from first data day (07-01) to today (07-01).
  // 2026-07-01 is a Wednesday → 1 workday.
  assert.equal(panel.summary.averages.online.monthAverageMinutes, 120);
  assert.equal(panel.summary.averages.checkIn.monthAverageMinutes, 60);
  assert.equal(panel.summary.averages.online.totalAverageMinutes, 120);
  assert.equal(panel.summary.averages.checkIn.totalAverageMinutes, 60);
});

test('checkIn and checkOut allow multiple sessions in one day and accumulate minutes', async () => {
  const service = createAttendanceService({
    checkInSessions: [
      {
        id: 'session-1',
        userId: 'user-1',
        workDate: '2026-07-01',
        checkInAt: new Date('2026-07-01T01:00:00.000Z'),
        checkOutAt: new Date('2026-07-01T02:00:00.000Z'),
      },
    ],
  });

  const actor = { sub: 'user-1', role: 'MEMBER' } as any;

  const afterCheckIn = await withMockedNow('2026-07-01T04:00:00.000Z', () => service.checkIn(actor));
  assert.equal(afterCheckIn.status, 'CHECKED_IN');
  assert.equal(afterCheckIn.checkInMinutes, 60);
  assert.equal(afterCheckIn.checkOutAt, null);

  const afterCheckOut = await withMockedNow('2026-07-01T05:30:00.000Z', () => service.checkOut(actor));
  assert.equal(afterCheckOut.status, 'CHECKED_OUT');
  assert.equal(afterCheckOut.checkInMinutes, 150);
  assert.equal(afterCheckOut.checkInAt, '2026-07-01T01:00:00.000Z');
  assert.equal(afterCheckOut.checkOutAt, '2026-07-01T05:30:00.000Z');
});

test('concurrent check-in requests create at most one open session', async () => {
  const checkInSessions: Array<{
    id: string;
    userId: string;
    workDate: string;
    checkInAt: Date | null;
    checkOutAt: Date | null;
  }> = [];
  let initialReads = 0;
  let releaseInitialReads: (() => void) | null = null;
  const initialReadsReady = new Promise<void>((resolve) => {
    releaseInitialReads = resolve;
  });
  const service = createAttendanceService({
    checkInSessions,
    enforceOpenSessionUniqueness: true,
    beforeCheckInSessionLookup: async () => {
      initialReads += 1;
      if (initialReads === 2) {
        releaseInitialReads?.();
      }
      if (initialReads <= 2) {
        await initialReadsReady;
      }
    },
  });
  const actor = { sub: 'user-1', role: 'MEMBER' } as any;

  await withMockedNow('2026-07-01T04:00:00.000Z', () =>
    Promise.all([service.checkIn(actor), service.checkIn(actor)]),
  );

  assert.equal(
    checkInSessions.filter((session) => session.checkOutAt === null).length,
    1,
  );
});

test('getOwnCheckInPanel aggregates multiple sessions from the same workday', async () => {
  const service = createAttendanceService({
    checkInSessions: [
      {
        id: 'session-1',
        userId: 'user-1',
        workDate: '2026-07-01',
        checkInAt: new Date('2026-07-01T01:00:00.000Z'),
        checkOutAt: new Date('2026-07-01T02:00:00.000Z'),
      },
      {
        id: 'session-2',
        userId: 'user-1',
        workDate: '2026-07-01',
        checkInAt: new Date('2026-07-01T03:00:00.000Z'),
        checkOutAt: new Date('2026-07-01T05:00:00.000Z'),
      },
    ],
  });

  const panel = await withMockedNow('2026-07-01T06:00:00.000Z', () =>
    service.getOwnCheckInPanel({ sub: 'user-1', role: 'MEMBER' } as any, 30),
  );

  assert.equal(panel.today.status, 'CHECKED_OUT');
  assert.equal(panel.today.checkInAt, '2026-07-01T01:00:00.000Z');
  assert.equal(panel.today.checkOutAt, '2026-07-01T05:00:00.000Z');
  assert.equal(panel.today.checkInMinutes, 180);
  assert.equal(panel.checkInSeries[panel.checkInSeries.length - 1]?.checkInMinutes, 180);
});

test('getOwnCheckInToday caps accumulated check-in minutes at 8 hours', async () => {
  const service = createAttendanceService({
    checkInSessions: [
      {
        id: 'session-1',
        userId: 'user-1',
        workDate: '2026-07-01',
        checkInAt: new Date('2026-07-01T00:00:00.000Z'),
        checkOutAt: new Date('2026-07-01T06:00:00.000Z'),
      },
      {
        id: 'session-2',
        userId: 'user-1',
        workDate: '2026-07-01',
        checkInAt: new Date('2026-07-01T07:00:00.000Z'),
        checkOutAt: new Date('2026-07-01T10:30:00.000Z'),
      },
    ],
  });

  const today = await withMockedNow('2026-07-01T10:30:00.000Z', () =>
    service.getOwnCheckInToday({ sub: 'user-1', role: 'MEMBER' } as any),
  );

  assert.equal(today.checkInMinutes, 480);
});

test('getUserStats caps online worked minutes at 8 hours', async () => {
  const service = createAttendanceService({
    presenceLogs: [
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-11T16:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
    ],
  });

  const stats = await withMockedNow('2026-05-12T12:30:00.000Z', () =>
    service.getUserStats('user-1', '2026-05-12'),
  );

  assert.equal(stats.dayWorkedMinutes, 480);
});

test('listUserAttendanceAverages caps presence-based daily totals at 8 hours', async () => {
  const service = createAttendanceService({
    presenceLogs: [
      {
        userId: 'user-1',
        createdAt: new Date('2026-05-11T16:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
    ],
  });

  const averages = await withMockedNow('2026-05-12T12:30:00.000Z', () =>
    service.listUserAttendanceAverages(),
  );

  assert.equal(averages.items[0]?.online.todayMinutes, 480);
  assert.equal(averages.items[0]?.online.monthAverageMinutes, 480);
  assert.equal(averages.items[0]?.online.totalAverageMinutes, 480);
});

test('getOwnCheckInPanel loads a presence range in a bounded number of queries', async () => {
  let findFirstCalls = 0;
  let findManyCalls = 0;
  const service = createAttendanceService({
    presenceLogs: [
      {
        userId: 'user-1',
        createdAt: new Date('2026-07-01T01:00:00.000Z'),
        isOnline: true,
        isDnd: false,
      },
      {
        userId: 'user-1',
        createdAt: new Date('2026-07-01T03:00:00.000Z'),
        isOnline: false,
        isDnd: false,
      },
    ],
    onPresenceFindFirst: () => {
      findFirstCalls += 1;
    },
    onPresenceFindMany: () => {
      findManyCalls += 1;
    },
  });

  await withMockedNow('2026-07-23T04:00:00.000Z', () =>
    service.getOwnCheckInPanel({ sub: 'user-1', role: 'MEMBER' } as any, 30),
  );

  assert.ok(findFirstCalls <= 2, `expected at most 2 previous-state queries, received ${findFirstCalls}`);
  assert.ok(findManyCalls <= 2, `expected at most 2 range queries, received ${findManyCalls}`);
});

test('listDailySummaries paginates before loading presence ranges', async () => {
  let findFirstCalls = 0;
  let findManyCalls = 0;
  const presenceLogs = Array.from({ length: 10 }, (_, index) => ({
    userId: 'user-1',
    createdAt: new Date(`2026-07-${String(index + 1).padStart(2, '0')}T01:00:00.000Z`),
    isOnline: index % 2 === 0,
    isDnd: false,
  }));
  const service = createAttendanceService({
    presenceLogs,
    onPresenceFindFirst: () => {
      findFirstCalls += 1;
    },
    onPresenceFindMany: () => {
      findManyCalls += 1;
    },
  });

  const result = await service.listDailySummaries({ limit: 1, offset: 0 });

  assert.equal(result.items.length, 1);
  assert.equal(result.total, 10);
  assert.ok(findFirstCalls <= 1, `expected at most 1 previous-state query, received ${findFirstCalls}`);
  assert.ok(findManyCalls <= 2, `expected date discovery plus 1 range query, received ${findManyCalls}`);
});

test('attendance migrations backfill historical presence and enforce one open session per day', () => {
  const migrationsRoot = join(process.cwd(), 'prisma', 'migrations');
  const migrationSql = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((directory) => readFileSync(join(migrationsRoot, directory, 'migration.sql'), 'utf8'))
    .join('\n');

  assert.match(
    migrationSql,
    /UPDATE\s+"PresenceLog"[\s\S]*"isOnline"\s*=\s*\(\s*"event"\s*=\s*'online'\s*\)/i,
  );
  assert.match(
    migrationSql,
    /CREATE\s+UNIQUE\s+INDEX[\s\S]*"CheckInSession"\s*\(\s*"userId"\s*,\s*"workDate"\s*\)[\s\S]*WHERE\s+"checkOutAt"\s+IS\s+NULL/i,
  );
  assert.match(
    migrationSql,
    /UPDATE\s+"PresenceLog"\s+AS\s+snapshot[\s\S]*'dnd_on'[\s\S]*'dnd_off'/i,
  );
});

function createAttendanceService(overrides: {
  presenceLogs?: Array<{ userId: string; createdAt: Date; isOnline: boolean; isDnd: boolean }>;
  checkInSessions?: Array<{ id: string; userId: string; workDate: string; checkInAt: Date | null; checkOutAt: Date | null }>;
  enforceOpenSessionUniqueness?: boolean;
  beforeCheckInSessionLookup?: () => Promise<void> | void;
  onPresenceFindFirst?: () => void;
  onPresenceFindMany?: () => void;
} = {}) {
  const presenceLogs = overrides.presenceLogs ?? [];
  const checkInSessions = overrides.checkInSessions ?? [];
  const prismaService = {
    $transaction: async (callback: (transaction: any) => Promise<unknown>) => callback(prismaService),
    user: {
      findMany: async () => [
        { id: 'user-1', email: 'one@example.com', displayName: 'One', role: 'MEMBER' },
      ],
    },
    attendanceActionEvent: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async () => undefined,
    },
    attendanceDaily: {
      upsert: async () => undefined,
      findUnique: async () => null,
      aggregate: async () => ({ _sum: { workedMinutes: null } }),
      findMany: async () => [],
      count: async () => 0,
      deleteMany: async () => undefined,
    },
    attendanceUserPolicy: {
      findUnique: async () => null,
    },
    checkInSession: {
      findFirst: async ({ where }: any = {}) => {
        await overrides.beforeCheckInSessionLookup?.();
        return checkInSessions.find((item) =>
          (!where?.userId || item.userId === where.userId)
          && (!where?.workDate || item.workDate === where.workDate)
          && (where?.checkOutAt !== null || item.checkOutAt === null),
        ) ?? null;
      },
      findMany: async ({ where, orderBy }: any = {}) => {
        await overrides.beforeCheckInSessionLookup?.();
        let items = [...checkInSessions];
        if (where?.userId) {
          items = items.filter((item) => item.userId === where.userId);
        }
        if (where?.workDate?.gte) {
          items = items.filter((item) => item.workDate >= where.workDate.gte);
        }
        if (where?.workDate?.lte) {
          items = items.filter((item) => item.workDate <= where.workDate.lte);
        }
        items.sort((left, right) =>
          orderBy?.workDate === 'desc'
            ? right.workDate.localeCompare(left.workDate)
            : left.workDate.localeCompare(right.workDate),
        );
        return items;
      },
      create: async ({ data }: any) => {
        if (
          overrides.enforceOpenSessionUniqueness
          && checkInSessions.some((session) =>
            session.userId === data.userId
            && session.workDate === data.workDate
            && session.checkOutAt === null
          )
        ) {
          throw Object.assign(new Error('unique constraint'), { code: 'P2002' });
        }
        const created = {
          id: `session-${checkInSessions.length + 1}`,
          userId: data.userId,
          workDate: data.workDate,
          checkInAt: data.checkInAt ?? null,
          checkOutAt: data.checkOutAt ?? null,
        };
        checkInSessions.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const item = checkInSessions.find((session) => session.id === where.id);
        if (!item) {
          throw new Error(`unknown check-in session ${where.id}`);
        }
        item.checkOutAt = data.checkOutAt ?? item.checkOutAt;
        return item;
      },
      deleteMany: async ({ where }: any) => {
        const before = checkInSessions.length;
        for (let index = checkInSessions.length - 1; index >= 0; index -= 1) {
          const item = checkInSessions[index];
          if (item.userId === where.userId && item.workDate === where.workDate) {
            checkInSessions.splice(index, 1);
          }
        }
        return { count: before - checkInSessions.length };
      },
    },
    presenceLog: {
      findFirst: async ({ where }: any) => {
        overrides.onPresenceFindFirst?.();
        return presenceLogs
          .filter((item) => item.userId === where.userId && item.createdAt < where.createdAt.lt)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ?? null;
      },
      findMany: async ({ where, orderBy }: any = {}) => {
        overrides.onPresenceFindMany?.();
        let items = [...presenceLogs];
        if (where?.userId) {
          items = items.filter((item) => item.userId === where.userId);
        }
        if (where?.createdAt?.gte) {
          items = items.filter((item) => item.createdAt >= where.createdAt.gte);
        }
        if (where?.createdAt?.lt) {
          items = items.filter((item) => item.createdAt < where.createdAt.lt);
        }
        items.sort((left, right) =>
          orderBy?.createdAt === 'desc'
            ? right.createdAt.getTime() - left.createdAt.getTime()
            : left.createdAt.getTime() - right.createdAt.getTime(),
        );
        return items;
      },
    },
  };

  const attendanceConfigService = {
    getRawConfig: async () => ({
      attendanceTimezone: 'Asia/Shanghai',
      attendanceClockInStart: '08:00',
      attendanceClockInEnd: '10:00',
      attendanceClockOutStart: '16:00',
      attendanceClockOutEnd: '19:00',
      attendanceWorkDays: '1,2,3,4,5',
      attendanceScheduledBreakMinutes: '60',
      attendanceActiveWindowMinutes: '120',
    }),
  };
  const permissionConfigService = {
    getRolePermissions: async () => ({}),
  };
  const service = new AttendanceService(
    prismaService as any,
    attendanceConfigService as any,
    permissionConfigService as any,
    new CheckInCommandService(prismaService as any),
    new AttendanceActionRecorder(prismaService as any),
    new AttendanceQueryService(prismaService as any, permissionConfigService as any),
    new AttendanceProjectionService(),
  );
  return service;
}

async function withMockedNow<T>(isoString: string, callback: () => Promise<T>): Promise<T> {
  const RealDate = Date;
  const fixed = new RealDate(isoString);

  globalThis.Date = class extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(fixed);
        return;
      }

      if (args.length === 1) {
        super(args[0]);
        return;
      }
      if (args.length === 2) {
        super(args[0], args[1]);
        return;
      }
      if (args.length === 3) {
        super(args[0], args[1], args[2]);
        return;
      }
      if (args.length === 4) {
        super(args[0], args[1], args[2], args[3]);
        return;
      }
      if (args.length === 5) {
        super(args[0], args[1], args[2], args[3], args[4]);
        return;
      }
      if (args.length === 6) {
        super(args[0], args[1], args[2], args[3], args[4], args[5]);
        return;
      }
      super(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
    }

    static now() {
      return fixed.getTime();
    }
  } as DateConstructor;

  try {
    return await callback();
  } finally {
    globalThis.Date = RealDate;
  }
}
