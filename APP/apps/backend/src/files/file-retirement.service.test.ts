import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FileRetirementService } from './file-retirement.service';

function fixture({ references = 0, shared = false, promoted = false, missing = false, recent = false, external = false } = {}) {
  const calls: string[] = [];
  const tx = {
    $queryRaw: async () => { calls.push('lock'); return [{ id: 'file' }]; },
    fileObject: {
      findUnique: async () => missing ? null : ({ id: 'file', storageKey: external ? 'external-images/group/hash' : 'group/random-file', thumbnailStorageKey: 'thumb/random', attachedAt: recent ? null : new Date(), createdAt: new Date(), promotedArtifact: promoted ? { id: 'artifact' } : null }),
      delete: async () => { calls.push('delete-row'); },
    },
    message: { count: async () => { calls.push('recheck'); return references; } },
    fileShare: { findUnique: async () => shared ? { revokedAt: null, expiresAt: new Date(Date.now() + 10000) } : null },
    outboxEvent: { create: async ({ data }: { data: { payload: unknown } }) => { calls.push('enqueue'); assert.deepEqual(data.payload, { storageKeys: ['group/random-file', 'thumb/random'] }); } },
  };
  const service = new FileRetirementService({ $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as never, {} as never);
  return { service, calls };
}

test('retirement locks, rechecks and durably queues object deletion with the row deletion', async () => {
  const { service, calls } = fixture();
  assert.equal(await service.retire('file'), true);
  assert.deepEqual(calls, ['lock', 'recheck', 'enqueue', 'delete-row']);
});
for (const options of [{ references: 1 }, { shared: true }, { promoted: true }, { missing: true }, { recent: true }, { external: true }]) {
  test(`retirement protects live reference ${JSON.stringify(options)}`, async () => {
    const { service, calls } = fixture(options);
    assert.equal(await service.retire('file'), false);
    assert(!calls.includes('delete-row'));
    assert(!calls.includes('enqueue'));
  });
}
