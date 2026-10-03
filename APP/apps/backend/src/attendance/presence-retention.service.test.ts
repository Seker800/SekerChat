import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttendanceProjectionService } from './attendance-projection.service';
import { PresenceRetentionService } from './presence-retention.service';

test('presence compaction preserves daily projection and its next-day boundary state', async () => {
  const events = [
    { userId: 'user-1', createdAt: new Date('2025-01-06T01:00:00Z'), isOnline: true, isDnd: false },
    { userId: 'user-1', createdAt: new Date('2025-01-06T02:00:00Z'), isOnline: true, isDnd: true },
  ];
  let summary: Record<string, unknown> | null = null;
  const prisma = {
    presenceLog: {
      findFirst: async ({ where }: any) => where?.createdAt?.lt && !where?.userId
        ? events[0] ?? null : null,
      findMany: async () => events,
      deleteMany: async () => { events.splice(0); return { count: 2 }; },
    },
    presenceDailySummary: {
      findFirst: async () => null,
      upsert: async ({ create }: any) => { summary = create; },
    },
    $transaction: async (operation: (tx: unknown) => Promise<void>) => operation(prisma),
  };
  const config = { getRawConfig: async () => ({ attendanceTimezone: 'Asia/Shanghai' }) };
  await new PresenceRetentionService(
    prisma as never, config as never, new AttendanceProjectionService(),
  ).compactOldDays();

  const saved = summary as Record<string, unknown> | null;
  assert.equal(saved?.onlineWorkMinutes, 60);
  assert.equal(saved?.endIsOnline, true);
  assert.equal(saved?.endIsDnd, true);
  assert.equal(events.length, 0);
});
