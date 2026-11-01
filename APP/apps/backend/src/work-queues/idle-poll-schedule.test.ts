import assert from 'node:assert/strict';
import test from 'node:test';
import { IdlePollSchedule } from './idle-poll-schedule';
import { WorkQueueSignals } from './work-queue-signals.service';

test('idle workers back off for ten minutes but a wakeup is immediate', () => {
  const schedule = new IdlePollSchedule();
  let polls = 0;
  for (let now = 0; now < 600_000; now += 10_000) {
    if (schedule.ready(now)) {
      polls++;
      schedule.idle(now);
    }
  }
  assert.equal(polls, 12);
  assert.equal(schedule.ready(599_999), false);
  schedule.wake();
  assert.equal(schedule.ready(599_999), true);
});

test('post-commit hints coalesce per queue and unsubscribe cleanly', async () => {
  const signals = new WorkQueueSignals();
  let fileCalls = 0;
  let albumCalls = 0;
  const unsubscribe = signals.subscribe('file-preview', () => {
    fileCalls++;
  });
  signals.subscribe('album-media', () => {
    albumCalls++;
  });
  signals.notify('file-preview');
  signals.notify('file-preview');
  signals.notify('album-media');
  assert.equal(fileCalls, 0);
  await Promise.resolve();
  assert.equal(fileCalls, 1);
  assert.equal(albumCalls, 1);
  unsubscribe();
  signals.notify('file-preview');
  await Promise.resolve();
  assert.equal(fileCalls, 1);
});
