import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { createUploadBodyBudget } from './upload-body-budget';

test('multipart body admission limits buffering before parsing or authentication', () => {
  const admit = createUploadBodyBudget(2);
  const response = () => Object.assign(new EventEmitter(), { statusCode: 200, setHeader() {},
    status(code: number) { this.statusCode = code; return this; }, json() {} });
  let parsed = 0;
  const first = response(); const second = response(); const rejected = response();
  const run = (res: ReturnType<typeof response>) => admit({} as never, res as never, () => { parsed++; });
  run(first); run(second); run(rejected);
  assert.equal(parsed, 2);
  assert.equal(rejected.statusCode, 429);
  first.emit('finish'); first.emit('close');
  run(response()); run(response());
  assert.equal(parsed, 3, 'a response releases its permit exactly once');
});

test('one client cannot occupy every upload slot', () => {
  const admit = createUploadBodyBudget({ total: 2, perClient: 1 });
  const response = () => Object.assign(new EventEmitter(), {
    statusCode: 200,
    setHeader() {},
    status(code: number) { this.statusCode = code; return this; },
    json() {},
  });
  let parsed = 0;
  const run = (client: string, res: ReturnType<typeof response>) =>
    admit({ ip: client } as never, res as never, () => { parsed++; });

  const firstA = response();
  run('10.0.0.1', firstA);
  run('10.0.0.1', response()); // same client, per-client cap reached
  run('10.0.0.2', response()); // total cap reached by client B

  assert.equal(parsed, 2);

  firstA.emit('finish');
  run('10.0.0.1', response());
  assert.equal(parsed, 3, 'the released slot is reusable by the same client');
});
