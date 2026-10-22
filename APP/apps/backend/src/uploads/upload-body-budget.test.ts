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
