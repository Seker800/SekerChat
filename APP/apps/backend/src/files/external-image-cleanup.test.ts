import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FilesService } from './files.service';

function fixture({ references = 0, recent = false, share = false, storageFails = false } = {}) {
  const calls: string[] = [];
  const tx = {
    $queryRaw: async () => {
      calls.push('lock');
      return [];
    },
    fileObject: {
      findUnique: async () => ({
        id: 'file',
        storageKey: 'external-images/group/hash',
        thumbnailStorageKey: null,
        updatedAt: new Date(Date.now() - (recent ? 0 : 2 * 86400000)),
      }),
      delete: async () => {
        calls.push('delete-row');
      },
    },
    message: {
      count: async () => {
        calls.push('recheck-references');
        return references;
      },
    },
    fileShare: {
      findUnique: async () =>
        share ? { revokedAt: null, expiresAt: new Date(Date.now() + 86400000) } : null,
    },
  };
  const service = new FilesService(
    { $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as never,
    {
      delete: async () => {
        calls.push('delete-object');
        return !storageFails;
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, calls };
}

test('external image cleanup locks then rechecks references before deleting either store', async () => {
  const { service, calls } = fixture();
  assert.equal(await service.purgeUnreferencedExternalImage('file'), true);
  assert.deepEqual(calls, ['lock', 'recheck-references', 'delete-object', 'delete-row']);
});
test('a newly attached avatar or image is protected even if the initial orphan scan was stale', async () => {
  const { service, calls } = fixture({ references: 1 });
  assert.equal(await service.purgeUnreferencedExternalImage('file'), false);
  assert(!calls.includes('delete-object'));
});
test('upload reservations and active shares keep external images out of cleanup', async () => {
  for (const options of [{ recent: true }, { share: true }]) {
    const { service, calls } = fixture(options);
    assert.equal(await service.purgeUnreferencedExternalImage('file'), false);
    assert(!calls.includes('delete-object'));
  }
});
test('failed object deletion keeps the external image database reference for recovery', async () => {
  const { service, calls } = fixture({ storageFails: true });
  assert.equal(await service.purgeUnreferencedExternalImage('file'), false);
  assert(!calls.includes('delete-row'));
});
