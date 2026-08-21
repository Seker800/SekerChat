import 'reflect-metadata';
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { HttpExceptionLoggingFilter } from './http-exception.filter';

test('HttpExceptionLoggingFilter classifies Prisma schema drift with request id', () => {
  const filter = new HttpExceptionLoggingFilter();
  const logged: unknown[][] = [];
  (filter as any).logger = {
    error: (...args: unknown[]) => {
      logged.push(args);
    },
  };

  const response = createResponseDouble();
  const error = Object.assign(new Error('The table `public.UploadSession` does not exist.'), {
    code: 'P2021',
  });

  filter.catch(error, {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        originalUrl: '/api/groups',
        headers: { 'x-request-id': 'req-abc' },
        ip: '127.0.0.1',
        user: { sub: 'user-1' },
      }),
      getResponse: () => response,
    }),
  } as any);

  assert.equal(response.statusCode, 500);
  assert.equal(response.headers['X-Request-Id'], 'req-abc');
  assert.deepEqual(response.body, {
    statusCode: 500,
    code: 'DATABASE_SCHEMA_MISMATCH',
    message: 'Internal server error',
    requestId: 'req-abc',
  });
  assert.equal(logged.length, 1);
  assert.match(String(logged[0]?.[2]), /DATABASE_SCHEMA_MISMATCH/);
  assert.match(String(logged[0]?.[2]), /req-abc/);
});

test('HttpExceptionLoggingFilter returns localized payload for oversized upload parts', () => {
  const filter = new HttpExceptionLoggingFilter();
  const logged: unknown[][] = [];
  (filter as any).logger = {
    error: (...args: unknown[]) => {
      logged.push(args);
    },
  };

  const response = createResponseDouble();
  const error = Object.assign(new Error('File too large'), {
    name: 'MulterError',
    code: 'LIMIT_FILE_SIZE',
  });

  filter.catch(error, {
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'PUT',
        originalUrl: '/api/uploads/upload-1/parts/1',
        headers: { 'x-request-id': 'req-upload' },
        ip: '127.0.0.1',
        user: { sub: 'user-1' },
      }),
      getResponse: () => response,
    }),
  } as any);

  assert.equal(response.statusCode, 413);
  assert.deepEqual(response.body, {
    statusCode: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: '上传分片过大，请重试。',
    requestId: 'req-upload',
  });
  assert.equal(logged.length, 1);
  assert.match(String(logged[0]?.[1]), /PAYLOAD_TOO_LARGE/);
});

function createResponseDouble() {
  return {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name] = value;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
}
