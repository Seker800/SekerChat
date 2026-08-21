import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttendanceProjectionService } from './attendance-projection.service';

test('projects only online non-DND time and carries prior state into the day', () => {
  const projection = new AttendanceProjectionService()
    .projectDailyPresence(
      [
        { createdAt: new Date('2026-05-11T23:00:00.000Z'), isOnline: true, isDnd: false },
        { createdAt: new Date('2026-05-12T02:00:00.000Z'), isOnline: true, isDnd: true },
        { createdAt: new Date('2026-05-12T03:00:00.000Z'), isOnline: false, isDnd: false },
      ],
      '2026-05-12',
      '2026-05-12',
      'UTC',
    )
    .get('2026-05-12');

  assert.ok(projection);
  assert.equal(projection.onlineWorkMinutes, 120);
  assert.equal(projection.firstOnlineAt?.toISOString(), '2026-05-12T00:00:00.000Z');
  assert.equal(projection.lastOnlineAt?.toISOString(), '2026-05-12T03:00:00.000Z');
});
