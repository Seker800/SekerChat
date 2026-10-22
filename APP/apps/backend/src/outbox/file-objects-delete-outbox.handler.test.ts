import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FileObjectsDeleteOutboxHandler } from './file-objects-delete-outbox.handler';

test('storage cleanup retries partial failures without losing the durable job', async () => {
  let fail = true;
  const deleted: string[] = [];
  const handler = new FileObjectsDeleteOutboxHandler({ delete: async (key: string) => {
    deleted.push(key); return !(key === 'thumbnail' && fail);
  } } as never);
  const event = { payload: { storageKeys: ['original', 'thumbnail'] } } as never;
  await assert.rejects(() => handler.handle(event), /deletion failed/);
  fail = false;
  await handler.handle(event);
  assert.deepEqual(deleted, ['original', 'thumbnail', 'original', 'thumbnail']);
});
test('malformed jobs cannot delete reusable external objects', async () => {
  const handler = new FileObjectsDeleteOutboxHandler({ delete: async () => { throw new Error('must not run'); } } as never);
  for (const payload of [null, [], {}, { storageKeys: [42] }, { storageKeys: [''] }, { storageKeys: [] }, { storageKeys: ['external-images/group/hash'] }]) {
    await assert.rejects(() => handler.handle({ payload } as never), /Invalid/);
  }
});
