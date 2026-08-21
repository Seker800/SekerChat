import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedCorsOrigin, isLoopbackOrigin, resolveCorsOrigins } from './cors-origins';

test('resolveCorsOrigins prefers explicit CORS_ORIGINS list', () => {
  const origins = resolveCorsOrigins({
    CORS_ORIGINS: 'http://localhost:5173, https://im.example.com ',
    APP_BASE_URL: 'http://ignored.example.com',
    API_BASE_URL: 'http://ignored-api.example.com',
  });

  assert.deepEqual(origins, ['http://localhost:5173', 'https://im.example.com']);
});

test('isLoopbackOrigin accepts localhost and loopback ip variants', () => {
  assert.equal(isLoopbackOrigin('http://localhost:5173'), true);
  assert.equal(isLoopbackOrigin('http://127.0.0.1:4173'), true);
  assert.equal(isLoopbackOrigin('http://[::1]:5173'), true);
  assert.equal(isLoopbackOrigin('https://192.0.2.28:5173'), false);
});

test('isAllowedCorsOrigin keeps configured origins and local loopback origins in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const allowedOrigins = ['http://192.0.2.28:5173', 'http://192.0.2.28:3100'];

    assert.equal(isAllowedCorsOrigin(undefined, allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin('http://192.0.2.28:5173', allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin('http://localhost:4173', allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin('http://127.0.0.1:5173', allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin('http://evil.example.com', allowedOrigins), false);
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('isAllowedCorsOrigin allows any origin in dev mode', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const allowedOrigins = ['http://localhost:5173'];

    assert.equal(isAllowedCorsOrigin('http://198.51.100.185:5173', allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin('http://evil.example.com', allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin(undefined, allowedOrigins), true);
  } finally {
    process.env.NODE_ENV = prev;
  }
});
