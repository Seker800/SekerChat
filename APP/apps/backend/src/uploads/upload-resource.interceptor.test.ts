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
