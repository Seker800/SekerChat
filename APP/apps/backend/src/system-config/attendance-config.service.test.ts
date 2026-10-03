import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { AttendanceConfigService } from './attendance-config.service';

test('attendance timezone cannot change after historical presence is compacted', async () => {
  let updated = false;
  const store = { upsertMany: async () => { updated = true; } };
  const prisma = {
    presenceDailySummary: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.timezone.not, 'UTC');
        return { id: 'summary-1' };
      },
    },
  };
  const service = new AttendanceConfigService(store as never, prisma as never);
  await assert.rejects(
    service.updateFromDto({ attendanceTimezone: 'UTC' }),
    BadRequestException,
  );
  assert.equal(updated, false);
});

test('attendance settings remain editable when the timezone matches compacted history', async () => {
  let updatedTimezone: unknown;
  const store = { upsertMany: async (values: Record<string, unknown>) => { updatedTimezone = values.attendanceTimezone; } };
  const prisma = { presenceDailySummary: { findFirst: async () => null } };
  const service = new AttendanceConfigService(store as never, prisma as never);
  await service.updateFromDto({ attendanceTimezone: 'Asia/Shanghai' });
  assert.equal(updatedTimezone, 'Asia/Shanghai');
});
