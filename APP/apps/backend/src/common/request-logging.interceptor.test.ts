import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeLoggedRequest } from './request-logging.interceptor';

test('request logging strips query strings when Express route metadata is unavailable', () => {
  const summary = summarizeLoggedRequest({
    originalUrl: '/api/health/ready?probe=private',
  });

  assert.deepEqual(summary, { route: '/api/health/ready' });
});
