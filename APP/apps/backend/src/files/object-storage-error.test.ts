import assert from 'node:assert/strict';
import test from 'node:test';
import { objectStorageErrorDetails } from './object-storage-error';

test('object storage telemetry keeps diagnostic metadata without leaking object keys', () => {
  const error = Object.assign(new Error('upstream failure for private/object-key'), {
    name: 'SlowDown',
    Code: 'SlowDown',
    $metadata: {
      httpStatusCode: 503,
      requestId: 'request-123',
      extendedRequestId: 'extended-456',
      attempts: 3,
      totalRetryDelay: 250,
    },
  });

  assert.deepEqual(objectStorageErrorDetails('GetObject', error, 42), {
    operation: 'GetObject',
    errorName: 'SlowDown',
    errorCode: 'SlowDown',
    httpStatusCode: 503,
    requestId: 'request-123',
    extendedRequestId: 'extended-456',
    attempts: 3,
    totalRetryDelayMs: 250,
    durationMs: 42,
  });
  assert.equal(JSON.stringify(objectStorageErrorDetails('GetObject', error, 42)).includes('object-key'), false);
});

test('object storage telemetry remains useful for non-AWS errors', () => {
  assert.deepEqual(objectStorageErrorDetails('PutObject', new Error('socket closed'), 7), {
    operation: 'PutObject',
    errorName: 'Error',
    durationMs: 7,
  });
});

test('object storage telemetry exposes safe retry and network-cause diagnostics', () => {
  const error = Object.assign(new Error('request included private/object-key'), {
    name: 'UnknownError',
    $fault: 'server',
    $retryable: { throttling: true },
    cause: Object.assign(new Error('connect to secret endpoint'), {
      name: 'Error',
      code: 'ECONNRESET',
    }),
  });

  const details = objectStorageErrorDetails('GetObject', error, 11);
  assert.deepEqual(details, {
    operation: 'GetObject',
    errorName: 'UnknownError',
    fault: 'server',
    sdkRetryable: true,
    throttling: true,
    causeName: 'Error',
    causeCode: 'ECONNRESET',
    durationMs: 11,
  });
  assert.equal(JSON.stringify(details).includes('private/object-key'), false);
  assert.equal(JSON.stringify(details).includes('secret endpoint'), false);
});
