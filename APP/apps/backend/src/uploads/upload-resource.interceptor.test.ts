import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lastValueFrom, of, Subject } from 'rxjs';
import { UploadResourceInterceptor } from './upload-resource.interceptor';

function context(name = 'initiateUpload') {
  return { getHandler: () => ({ name }), switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'user' }, body: { size: 1 } }) }) } as never;
}
test('upload admission rejects excessive durable sessions before starting storage work', async () => {
  const interceptor = new UploadResourceInterceptor({ uploadSession: { aggregate: async () => ({ _count: 8, _sum: { size: 1n } }) } } as never);
  let called = false;
  await assert.rejects(() => lastValueFrom(interceptor.intercept(context(), { handle: () => { called = true; return of('ok'); } })), /上传会话/);
  assert.equal(called, false);
});
test('finalization permits are bounded and released on unsubscribe', async () => {
  const interceptor = new UploadResourceInterceptor({} as never);
  const pending = new Subject();
  const subscription = interceptor.intercept(context('completeUpload'), { handle: () => pending }).subscribe();
  await assert.rejects(() => lastValueFrom(interceptor.intercept(context('completeUpload'), { handle: () => of('unexpected') })), /繁忙/);
  subscription.unsubscribe();
  assert.equal(await lastValueFrom(interceptor.intercept(context('completeUpload'), { handle: () => of('ok') })), 'ok');
});

test('upload admission accepts an empty budget and rejects excessive reserved bytes', async () => {
  const accepted = new UploadResourceInterceptor({ uploadSession: { aggregate: async () => ({ _count: 0, _sum: { size: null } }) } } as never);
  assert.equal(await lastValueFrom(accepted.intercept(context(), { handle: () => of('ok') })), 'ok');
  const full = new UploadResourceInterceptor({ uploadSession: { aggregate: async () => ({ _count: 1, _sum: { size: 21n * 1024n ** 3n } }) } } as never);
  await assert.rejects(() => lastValueFrom(full.intercept(context(), { handle: () => of('unexpected') })), /预留容量/);
  assert.equal(await lastValueFrom(accepted.intercept(context('getUploadedParts'), { handle: () => of('read') })), 'read');
});
