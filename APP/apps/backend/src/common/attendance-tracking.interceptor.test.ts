import 'reflect-metadata';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { of } from 'rxjs';
import { AttendanceTrackingInterceptor } from './attendance-tracking.interceptor';

test('AttendanceTrackingInterceptor records attendance for successful HTTP mutations', async () => {
  const recordedRequests: Array<{ method: string; originalUrl: string }> = [];
  const interceptor = new AttendanceTrackingInterceptor({
    recordManualAction: async (request: { method: string; originalUrl: string }) => {
      recordedRequests.push({
        method: request.method,
        originalUrl: request.originalUrl,
      });
    },
  } as any);

  await runInterceptor(interceptor, {
    request: {
      method: 'POST',
      originalUrl: '/api/groups/group-1/messages',
      user: { sub: 'user-1', actorType: 'HUMAN' },
    },
    response: { statusCode: 201 },
  });

  assert.deepEqual(recordedRequests, [
    { method: 'POST', originalUrl: '/api/groups/group-1/messages' },
  ]);
});

test('AttendanceTrackingInterceptor skips attendance recording for non-success responses', async () => {
  let recordCount = 0;
  const interceptor = new AttendanceTrackingInterceptor({
    recordManualAction: async () => {
      recordCount += 1;
    },
  } as any);

  await runInterceptor(interceptor, {
    request: {
      method: 'POST',
      originalUrl: '/api/groups/group-1/messages',
      user: { sub: 'user-1', actorType: 'HUMAN' },
    },
    response: { statusCode: 409 },
  });

  assert.equal(recordCount, 0);
});

test('AttendanceTrackingInterceptor logs attendance recording failures without breaking the request', async () => {
  const logged: unknown[][] = [];
  const interceptor = new AttendanceTrackingInterceptor({
    recordManualAction: async () => {
      throw new Error('db unavailable');
    },
  } as any);
  (interceptor as any).logger = {
    error: (...args: unknown[]) => {
      logged.push(args);
    },
  };

  await runInterceptor(interceptor, {
    request: {
      method: 'PATCH',
      originalUrl: '/api/groups/group-1/tasks/task-1',
      user: { sub: 'user-2', actorType: 'HUMAN' },
    },
    response: { statusCode: 200 },
  });

  assert.equal(logged.length, 1);
  assert.match(String(logged[0]?.[0]), /Failed to record attendance action/);
  assert.match(String(logged[0]?.[1]), /user-2/);
  assert.match(String(logged[0]?.[1]), /db unavailable/);
});

async function runInterceptor(
  interceptor: AttendanceTrackingInterceptor,
  options: {
    request: { method: string; originalUrl: string; user?: { sub?: string; actorType?: 'AGENT_BOT' | 'CLI_BOT' | 'HUMAN' } };
    response: { statusCode: number };
  },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    interceptor.intercept(
      {
        switchToHttp: () => ({
          getRequest: () => options.request,
          getResponse: () => options.response,
        }),
      } as any,
      {
        handle: () => of({ ok: true }),
      },
    ).subscribe({
      complete: resolve,
      error: reject,
    });
  });

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
}
