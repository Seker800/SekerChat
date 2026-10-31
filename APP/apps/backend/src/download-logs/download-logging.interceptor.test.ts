import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import test from 'node:test';
import { StreamableFile, type ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { DownloadLoggingInterceptor } from './download-logging.interceptor';

function fixture() {
  const rows: any[] = [];
  const request = {
    method: 'GET',
    originalUrl: '/api/groups/g/files/f/content?secret=never-log',
    route: { path: '/api/groups/:groupId/files/:fileId/content' },
    params: { groupId: 'g', fileId: 'f' },
    user: { sub: 'user-1' },
    headers: {},
  };
  const headers: Record<string, string> = { 'content-length': '6' };
  const response = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableFinished: false,
    setHeader: (key: string, value: string) => {
      headers[key.toLowerCase()] = value;
    },
    getHeader: (key: string) => headers[key.toLowerCase()],
  });
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  const interceptor = new DownloadLoggingInterceptor({
    record: (row: unknown) => rows.push(row),
  } as any);
  return { rows, request, response, context, interceptor };
}

test('server records start and stream completion, including bytes but no URL credentials', async () => {
  const f = fixture();
  const result = await lastValueFrom(
    f.interceptor.intercept(f.context, {
      handle: () => of(new StreamableFile(Readable.from([Buffer.from('abcdef')]))),
    }),
  );
  assert.ok(result instanceof StreamableFile);
  let bytes = 0;
  for await (const chunk of result.getStream()) bytes += chunk.length;
  f.response.writableFinished = true;
  f.response.emit('finish');
  f.response.emit('close');
  assert.equal(bytes, 6);
  assert.deepEqual(
    f.rows.map((row) => row.event),
    ['started', 'completed'],
  );
  assert.equal(f.rows[1].bytes, 6);
  assert.equal(f.rows[1].userId, 'user-1');
  assert.equal(f.rows[1].resourceId, 'f');
  assert.equal(f.rows[1].source, 'server');
  assert.ok(!JSON.stringify(f.rows).includes('secret'));
});

test('server preserves failure and early disconnect as separate outcomes', async () => {
  const f = fixture();
  await assert.rejects(
    lastValueFrom(
      f.interceptor.intercept(f.context, {
        handle: () => throwError(() => new Error('private details')),
      }),
    ),
  );
  assert.equal(f.rows.at(-1).event, 'failed');
  assert.ok(!JSON.stringify(f.rows).includes('private details'));
  const g = fixture();
  const source = new Readable({ read() {} });
  const result = await lastValueFrom(
    g.interceptor.intercept(g.context, { handle: () => of(new StreamableFile(source)) }),
  );
  g.response.emit('close');
  assert.equal(g.rows.at(-1).event, 'cancelled');
  assert.equal(source.destroyed, true);
  assert.ok(result instanceof StreamableFile);
});

test('metadata and thumbnails do not become download records', async () => {
  const f = fixture();
  f.request.route.path = '/api/groups/:groupId/files/:fileId/thumbnail';
  const original = new StreamableFile(Buffer.from('thumbnail'));
  assert.equal(
    await lastValueFrom(f.interceptor.intercept(f.context, { handle: () => of(original) })),
    original,
  );
  assert.equal(f.rows.length, 0);
});

test('an already disconnected request cannot leave a late object stream running', async () => {
  const f = fixture();
  const source = new Readable({ read() {} });
  const observable = f.interceptor.intercept(f.context, {
    handle: () => of(new StreamableFile(source)),
  });
  f.response.emit('close');
  await lastValueFrom(observable);
  assert.equal(source.destroyed, true);
  assert.equal(f.rows.at(-1).event, 'cancelled');
});

test('public share correlation never stores the raw share URL identifier', async () => {
  const f = fixture();
  f.request.route.path = '/api/public/file-shares/:shareId/content';
  (f.request as any).params = { shareId: 'private-share-link-identifier' };
  const result = await lastValueFrom(
    f.interceptor.intercept(f.context, {
      handle: () => of(new StreamableFile(Buffer.from('abcdef'))),
    }),
  );
  for await (const _chunk of (result as StreamableFile).getStream()) {
    /* Drain the real stream. */
  }
  f.response.emit('finish');
  assert.match(f.rows[0].resourceId, /^[a-f0-9]{64}$/);
  assert.equal(f.rows[0].resourceKind, 'public_share');
  assert.ok(!JSON.stringify(f.rows).includes('private-share-link-identifier'));
});
