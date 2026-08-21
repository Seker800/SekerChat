import assert from 'node:assert/strict';
import test from 'node:test';
import { AlbumMediaJobService } from './album-media-job.service';

test('claimNext atomically claims one due job and recovers an expired lease', async () => {
  const rawQueries: unknown[] = [];
  const updates: any[] = [];
  const transaction = {
    $queryRaw: async (query: unknown) => {
      rawQueries.push(query);
      return [{ id: 'job-1', photoId: 'photo-1', kind: 'GENERATE_THUMBNAIL', attempts: 2 }];
    },
    albumMediaJob: {
      update: async (args: unknown) => {
        updates.push(args);
        return { id: 'job-1', photoId: 'photo-1', kind: 'GENERATE_THUMBNAIL', attempts: 3 };
      },
    },
  };
  const prisma = {
    $transaction: async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
  };
  const service = new AlbumMediaJobService(prisma as never);

  const claimed = await service.claimNext();

  assert.equal(claimed?.id, 'job-1');
  assert.equal(rawQueries.length, 1);
  assert.match((rawQueries[0] as { strings: string[] }).strings.join(''), /FOR UPDATE SKIP LOCKED/);
  assert.match(
    (rawQueries[0] as { strings: string[] }).strings.join(''),
    /GENERATE_THUMBNAIL[\s\S]*PURGE_PHOTO[\s\S]*HASH_CONTENT/,
  );
  assert.equal(updates[0].data.status, 'PROCESSING');
  assert.deepEqual(updates[0].data.attempts, { increment: 1 });
  assert.ok(updates[0].data.lockedAt instanceof Date);
  assert.equal(updates[0].data.lastError, null);
});

test('markFailed retries with bounded exponential backoff before terminal failure', async () => {
  const updates: any[] = [];
  const service = new AlbumMediaJobService({
    albumMediaJob: { update: async (args: unknown) => updates.push(args) },
  } as never);

  await service.markFailed({ id: 'job-1', attempts: 3 } as never, new Error('temporary'));
  await service.markFailed({ id: 'job-2', attempts: 12 } as never, new Error('permanent'));

  assert.equal(updates[0].data.status, 'PENDING');
  assert.ok(updates[0].data.availableAt instanceof Date);
  assert.equal(updates[1].data.status, 'FAILED');
  assert.equal(updates[1].data.availableAt, undefined);
});
