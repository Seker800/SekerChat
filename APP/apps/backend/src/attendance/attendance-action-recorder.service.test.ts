import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { AttendanceActionRecorder } from './attendance-action-recorder.service';

test('records a human mutation once within the idempotency window', async () => {
  const created: unknown[] = [];
  let existing: { id: string } | null = null;
  const recorder = new AttendanceActionRecorder({
    attendanceActionEvent: {
      findFirst: async () => existing,
      create: async ({ data }: { data: unknown }) => {
        created.push(data);
        existing = { id: 'event-1' };
      },
    },
  } as never);
  const request = {
    user: { sub: 'user-1', actorType: 'HUMAN' as const },
    method: 'POST',
    originalUrl: '/api/groups/group-1/messages?draft=false',
  } as never;

  await recorder.record(request);
  await recorder.record(request);

  assert.equal(created.length, 1);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(created[0] as Record<string, unknown>).filter(([key]) =>
        ['userId', 'actionType', 'requestPath', 'groupId'].includes(key),
      ),
    ),
    {
      userId: 'user-1',
      actionType: 'message.send',
      requestPath: '/api/groups/group-1/messages',
      groupId: 'group-1',
    },
  );
  assert.ok((created[0] as { occurredAt: unknown }).occurredAt instanceof Date);
});

test('ignores bot and read-only requests', async () => {
  let queries = 0;
  const recorder = new AttendanceActionRecorder({
    attendanceActionEvent: {
      findFirst: async () => {
        queries += 1;
        return null;
      },
    },
  } as never);

  await recorder.record({
    user: { sub: 'bot-1', actorType: 'AGENT_BOT' },
    method: 'POST',
    originalUrl: '/api/groups/group-1/messages',
  } as never);
  await recorder.record({
    user: { sub: 'user-1', actorType: 'HUMAN' },
    method: 'GET',
    originalUrl: '/api/groups/group-1/messages',
  } as never);

  assert.equal(queries, 0);
});
