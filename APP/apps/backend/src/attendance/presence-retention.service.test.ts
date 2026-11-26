import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttendanceProjectionService } from './attendance-projection.service';
import { PresenceRetentionService } from './presence-retention.service';

function rawText(query: unknown): string {
  return String((query as { sql?: string })?.sql ?? query);
}

test('presence compaction preserves daily projection and its next-day boundary state', async () => {
  const events = [
    { userId: 'user-1', createdAt: new Date('2025-01-06T01:00:00Z'), isOnline: true, isDnd: false },
    { userId: 'user-1', createdAt: new Date('2025-01-06T02:00:00Z'), isOnline: true, isDnd: true },
  ];
  let summary: Record<string, unknown> | null = null;
  const prisma: Record<string, any> = {
    $queryRaw: async (query: unknown) => (rawText(query).includes('PresenceLog') ? [] : []),
    presenceLog: {
      findFirst: async ({ where }: any) =>
        where?.createdAt?.lt && !where?.userId ? (events[0] ?? null) : null,
      findMany: async () => events,
      deleteMany: async () => {
        const count = events.length;
        events.splice(0);
        return { count };
      },
    },
    presenceDailySummary: {
      findFirst: async () => null,
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: any) => {
        summary = data[0] ?? null;
        return { count: data.length };
      },
    },
    $transaction: async (operation: (tx: unknown) => Promise<void>) => operation(prisma),
  };
  const config = { getRawConfig: async () => ({ attendanceTimezone: 'Asia/Shanghai' }) };
  await new PresenceRetentionService(
    prisma as never,
    config as never,
    new AttendanceProjectionService(),
  ).compactOldDays();

  const saved = summary as Record<string, unknown> | null;
  assert.equal(saved?.onlineWorkMinutes, 60);
  assert.equal(saved?.endIsOnline, true);
  assert.equal(saved?.endIsDnd, true);
  assert.equal(events.length, 0);
});

test('presence compaction stops before deleting events when summary timezones disagree', async () => {
  let rawRead = false;
  const prisma = {
    presenceDailySummary: { findFirst: async () => ({ id: 'summary-1' }) },
    presenceLog: {
      findFirst: async () => {
        rawRead = true;
        return null;
      },
    },
  };
  const config = { getRawConfig: async () => ({ attendanceTimezone: 'UTC' }) };
  await new PresenceRetentionService(
    prisma as never,
    config as never,
    new AttendanceProjectionService(),
  ).compactOldDays();
  assert.equal(rawRead, false);
});

test('presence compaction carries the previous compacted day into a raw event day', async () => {
  const logs = [
    {
      userId: 'user-1',
      createdAt: new Date('2025-01-06T18:00:00Z'),
      isOnline: false,
      isDnd: false,
    },
  ];
  let workedMinutes = -1;
  const prisma: Record<string, any> = {
    $queryRaw: async (query: unknown) => {
      const text = rawText(query);
      if (text.includes('PresenceLog') && text.includes('PresenceDailySummary') === false)
        return [];
      if (text.includes('PresenceDailySummary')) {
        return [
          {
            userId: 'user-1',
            workDate: '2025-01-06',
            endIsOnline: true,
            endIsDnd: false,
          },
        ];
      }
      return [];
    },
    presenceLog: {
      findFirst: async () => logs[0] ?? null,
      findMany: async () => logs,
      deleteMany: async () => {
        logs.splice(0);
        return { count: 1 };
      },
    },
    presenceDailySummary: {
      findFirst: async () => null,
      deleteMany: async () => ({ count: 0 }),
      createMany: async ({ data }: any) => {
        workedMinutes = data[0]?.onlineWorkMinutes ?? -1;
        return { count: data.length };
      },
    },
    $transaction: async (operation: (tx: unknown) => Promise<void>) => operation(prisma),
  };
  const config = { getRawConfig: async () => ({ attendanceTimezone: 'Asia/Shanghai' }) };
  await new PresenceRetentionService(
    prisma as never,
    config as never,
    new AttendanceProjectionService(),
  ).compactOldDays();
  assert.equal(workedMinutes, 120);
  assert.equal(logs.length, 0);
});
