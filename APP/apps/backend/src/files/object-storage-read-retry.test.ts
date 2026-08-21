import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeObjectReadWithRetry,
  isRetryableObjectReadError,
} from './object-storage-read-retry';

test('object reads retry only transient storage failures', () => {
  assert.equal(
    isRetryableObjectReadError({ name: 'SlowDown', $metadata: { httpStatusCode: 503 } }),
    true,
  );
  assert.equal(
    isRetryableObjectReadError({ name: 'TooManyRequests', $metadata: { httpStatusCode: 429 } }),
    true,
  );
  assert.equal(isRetryableObjectReadError({ name: 'TimeoutError', code: 'ETIMEDOUT' }), true);
  assert.equal(isRetryableObjectReadError({ name: 'UnknownError' }), true);

  assert.equal(
    isRetryableObjectReadError({ name: 'NotModified', $metadata: { httpStatusCode: 304 } }),
    false,
  );
  assert.equal(
    isRetryableObjectReadError({ name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }),
    false,
  );
  assert.equal(
    isRetryableObjectReadError({ name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } }),
    false,
  );
  assert.equal(isRetryableObjectReadError(new Error('validation failed')), false);
});

test('object reads perform one bounded retry after a transient failure', async () => {
  const transientError = { name: 'UnknownError' };
  const delays: number[] = [];
  let attempts = 0;

  const result = await executeObjectReadWithRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw transientError;
      return 'thumbnail';
    },
    {
      random: () => 0.5,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    },
  );

  assert.equal(result, 'thumbnail');
  assert.equal(attempts, 2);
  assert.deepEqual(delays, [100]);
});

test('object reads do not retry permanent failures', async () => {
  const permanentError = { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } };
  let attempts = 0;

  await assert.rejects(
    executeObjectReadWithRetry(async () => {
      attempts += 1;
      throw permanentError;
    }),
    (error) => error === permanentError,
  );

  assert.equal(attempts, 1);
});

test('object reads stop after the single retry and surface the latest error', async () => {
  const firstError = { name: 'UnknownError' };
  const finalError = { name: 'SlowDown', $metadata: { httpStatusCode: 503 } };
  let attempts = 0;

  await assert.rejects(
    executeObjectReadWithRetry(
      async () => {
        attempts += 1;
        throw attempts === 1 ? firstError : finalError;
      },
      { random: () => 0, sleep: async () => undefined },
    ),
    (error) => error === finalError,
  );

  assert.equal(attempts, 2);
});
