import 'reflect-metadata';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { AttendanceMonthlyReportService } from './attendance-monthly-report.service';

test('closed-month report is saved once and later reads do not recalculate it', async () => {
  const rows: Array<{ userId: string; month: string; generatedAt: Date; snapshot: any }> = [];
  let calculations = 0;
  const prisma = {
    user: {
      findMany: async () => [{ id: 'user-1', createdAt: new Date('2026-09-03T00:00:00.000Z') }],
    },
    attendanceMonthlyReport: {
      findMany: async ({ where }: any) =>
        rows
          .filter((row) => !where.userId || row.userId === where.userId)
          .map((row) => (where.userId ? row : { userId: row.userId, month: row.month })),
      findUnique: async ({ where }: any) =>
        rows.find(
          (row) =>
            row.userId === where.userId_month.userId && row.month === where.userId_month.month,
        ) ?? null,
      createMany: async ({ data }: any) => {
        const item = data[0];
        if (rows.some((row) => row.userId === item.userId && row.month === item.month))
          return { count: 0 };
        rows.push({ ...item, generatedAt: new Date('2026-10-01T00:05:00.000Z') });
        return { count: 1 };
      },
    },
  };
  const attendance = {
    calculateClosedMonthlyReport: async (_userId: string, month: string) => {
      calculations += 1;
      return {
        month,
        timezone: 'Asia/Shanghai',
        targetDailyMinutes: 480,
        range: {
          startDate: `${month}-01`,
          endDate: `${month}-30`,
          effectiveStartDate: `${month}-03`,
          effectiveEndDate: `${month}-30`,
        },
        summary: {
          expectedWorkDays: 20,
          targetMinutes: 9600,
          onlineTotalMinutes: 4800,
          checkInTotalMinutes: 4800,
          onlineCompletionPercent: 50,
          checkInCompletionPercent: 50,
          overallCompletionPercent: 50,
        },
        days: [
          { workDate: `${month}-03`, isWorkday: true, onlineMinutes: 240, checkInMinutes: 240 },
        ],
      };
    },
  };
  const service = new AttendanceMonthlyReportService(
    prisma as any,
    attendance as any,
    {
      getRawConfig: async () => ({}),
    } as any,
  );
  const now = new Date('2026-10-11T08:00:00.000Z');
  assert.equal(await service.generateMissingReports(50, now), 1);
  assert.equal(await service.generateMissingReports(50, now), 0);
  assert.equal(calculations, 1);
  const own = { sub: 'user-1', role: 'MEMBER', email: 'one@example.com' };
  const listed = await service.listOwnReports(own);
  assert.deepEqual(
    listed.items.map((item) => item.month),
    ['2026-09'],
  );
  assert.equal(listed.items[0].summary.overallCompletionPercent, 50);
  const saved = await service.getOwnReport(own, '2026-09');
  assert.equal(saved.userId, 'user-1');
  assert.equal(saved.summary.overallCompletionPercent, 50);
  assert.equal(calculations, 1);
  await assert.rejects(service.getOwnReport({ ...own, sub: 'user-2' }, '2026-09'), /尚未生成/);
  await assert.rejects(service.getOwnReport(own, '2026-10'), /尚未生成/);
});

test('newly closed month is generated for every user even when historical backfill is capped', async () => {
  const created: string[] = [];
  const prisma = {
    user: {
      findMany: async () => [
        { id: 'user-1', createdAt: new Date('2026-08-01T00:00:00.000Z') },
        { id: 'user-2', createdAt: new Date('2026-08-01T00:00:00.000Z') },
      ],
    },
    attendanceMonthlyReport: {
      findMany: async () => [],
      createMany: async ({ data }: any) => {
        created.push(`${data[0].userId}:${data[0].month}`);
        return { count: 1 };
      },
    },
  };
  const attendance = { calculateClosedMonthlyReport: async () => ({ days: [], summary: {} }) };
  const service = new AttendanceMonthlyReportService(
    prisma as any,
    attendance as any,
    {
      getRawConfig: async () => ({}),
    } as any,
  );

  assert.equal(await service.generateMissingReports(0, new Date('2026-10-11T08:00:00.000Z')), 2);
  assert.deepEqual(created, ['user-1:2026-09', 'user-2:2026-09']);
});
