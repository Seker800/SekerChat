import 'reflect-metadata';
import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import {
  enforceTrustedOriginForCookieAuth,
  hasBearerAuthorization,
} from './request-origin';

function createRequest(overrides: Partial<Request>): Request {
  return {
    method: 'POST',
    headers: {},
    ...overrides,
  } as Request;
}

test('hasBearerAuthorization detects bearer tokens', () => {
  assert.equal(
    hasBearerAuthorization(
      createRequest({ headers: { authorization: 'Bearer header.payload.signature' } }),
    ),
    true,
  );
  assert.equal(
    hasBearerAuthorization(createRequest({ headers: { authorization: 'Basic token' } })),
    false,
  );
});

test('enforceTrustedOriginForCookieAuth allows bearer-authenticated requests', () => {
  assert.doesNotThrow(() =>
    enforceTrustedOriginForCookieAuth(
      createRequest({
        headers: {
          authorization: 'Bearer header.payload.signature',
        },
      }),
      'https://im.example.com',
      'cookie-token',
    ),
  );
});

test('enforceTrustedOriginForCookieAuth rejects cross-site cookie writes in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(
      () =>
        enforceTrustedOriginForCookieAuth(
          createRequest({
            headers: {
              origin: 'https://evil.example.com',
            },
          }),
          'https://im.example.com',
          'cookie-token',
        ),
      (error: unknown) =>
        error instanceof ForbiddenException &&
        (error.getResponse() as any).code === 'ORIGIN_REJECTED',
    );
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('enforceTrustedOriginForCookieAuth rejects cookie writes without origin evidence in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(
      () =>
        enforceTrustedOriginForCookieAuth(
          createRequest({ headers: {} }),
          'https://im.example.com',
          'cookie-token',
        ),
      (error: unknown) =>
        error instanceof ForbiddenException
        && (error.getResponse() as any).code === 'ORIGIN_REQUIRED',
    );
  } finally {
    process.env.NODE_ENV = prev;
  }
});

test('enforceTrustedOriginForCookieAuth accepts same-origin cookie writes in production', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.doesNotThrow(() =>
      enforceTrustedOriginForCookieAuth(
        createRequest({
          headers: {
            origin: 'https://im.example.com',
          },
        }),
        'https://im.example.com',
        'cookie-token',
      ),
    );
  } finally {
    process.env.NODE_ENV = prev;
  }
});
