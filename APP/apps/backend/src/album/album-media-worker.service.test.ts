import assert from 'node:assert/strict';
import test from 'node:test';
import { AlbumMediaWorkerService } from './album-media-worker.service';

test('worker serializes concurrent drains and completes thumbnail work', async () => {
  const events: string[] = [];
  const jobs = [{ id: 'job-1', photoId: 'photo-1', kind: 'GENERATE_THUMBNAIL', attempts: 1 }];
  const worker = new AlbumMediaWorkerService(
    {
      claimNext: async () => jobs.shift() ?? null,
      markCompleted: async (id: string) => events.push(`completed:${id}`),
      markFailed: async () => events.push('failed'),
    } as never,
    {
      generateThumbnailForPhoto: async (id: string) => events.push(`thumbnail:${id}`),
      purgeDeletedPhoto: async () => events.push('purged'),
    } as never,
  );

  await Promise.all([worker.processPendingJobs(), worker.processPendingJobs()]);

  assert.deepEqual(events, ['thumbnail:photo-1', 'completed:job-1']);
});

test('worker delegates expired soft-delete jobs to recoverable object purge', async () => {
  const events: string[] = [];
  const jobs = [{ id: 'job-2', photoId: 'photo-2', kind: 'PURGE_PHOTO', attempts: 1 }];
  const worker = new AlbumMediaWorkerService(
    {
      claimNext: async () => jobs.shift() ?? null,
      markCompleted: async () => events.push('completed'),
      markFailed: async () => events.push('failed'),
    } as never,
    {
      generateThumbnailForPhoto: async () => events.push('thumbnail'),
      purgeDeletedPhoto: async (id: string) => events.push(`purge:${id}`),
    } as never,
  );

  await worker.processPendingJobs();

  assert.deepEqual(events, ['purge:photo-2', 'completed']);
});

test('worker backfills legacy album hashes through the durable media queue', async () => {
  const jobs = [{ id: 'job-3', photoId: 'photo-3', kind: 'HASH_CONTENT', attempts: 1 }];
  const hashed: string[] = [];
  const completed: string[] = [];
  const worker = new AlbumMediaWorkerService(
    {
      claimNext: async () => jobs.shift() ?? null,
      markCompleted: async (id: string) => completed.push(id),
      markFailed: async () => undefined,
    } as never,
    {
      hashPhotoContent: async (id: string) => hashed.push(id),
    } as never,
  );

  await worker.processPendingJobs();

  assert.deepEqual(hashed, ['photo-3']);
  assert.deepEqual(completed, ['job-3']);
});
