import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { FilePreviewWorkerService } from './file-preview-worker.service';

const claim = { fileId: 'file', attempts: 1, leaseVersion: 2 };

test('preview worker serializes drains and commits a real resized image with its metadata', async () => {
  const input = await sharp({
    create: { width: 1200, height: 600, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const claims = [claim];
  const uploads: Buffer[] = [];
  const completions: unknown[] = [];
  const worker = new FilePreviewWorkerService(
    {
      fileObject: { findUnique: async () => ({ storageKey: 'original', mimeType: 'image/png' }) },
    } as never,
    {
      claimNext: async () => claims.shift() ?? null,
      complete: async (_: unknown, metadata: unknown) => {
        completions.push(metadata);
        return true;
      },
      fail: () => assert.fail('unexpected failure'),
    } as never,
    {
      get: async () => ({ stream: Readable.from([input]) }),
      put: async (_: unknown, data: Buffer) => uploads.push(data),
    } as never,
  );
  await Promise.all([worker.processPendingJobs(), worker.processPendingJobs()]);
  assert.equal(uploads.length, 1);
  assert.equal((await sharp(uploads[0]).metadata()).width, 400);
  assert.deepEqual(completions, [
    {
      imageWidth: 1200,
      imageHeight: 600,
      thumbnailStorageKey: 'original/preview/2.jpg',
      thumbnailSize: uploads[0].length,
    },
  ]);
});

test('failed processing is persisted and never marked ready', async () => {
  const claims = [claim];
  const failures: string[] = [];
  const worker = new FilePreviewWorkerService(
    {
      fileObject: { findUnique: async () => ({ storageKey: 'bad', mimeType: 'image/png' }) },
    } as never,
    {
      claimNext: async () => claims.shift() ?? null,
      complete: () => assert.fail('corrupt image completed'),
      fail: async (_: unknown, error: Error) => failures.push(error.message),
    } as never,
    { get: async () => ({ stream: Readable.from(['corrupt']) }) } as never,
  );
  await worker.processPendingJobs();
  assert.match(failures[0], /unsupported image format/);
});

test('an expired worker removes its unused thumbnail instead of publishing it', async () => {
  const input = await sharp({ create: { width: 4, height: 3, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  const claims = [claim];
  const deleted: string[] = [];
  const worker = new FilePreviewWorkerService(
    {
      fileObject: { findUnique: async () => ({ storageKey: 'original', mimeType: 'image/png' }) },
    } as never,
    {
      claimNext: async () => claims.shift() ?? null,
      complete: async () => false,
      fail: () => assert.fail('unexpected failure'),
    } as never,
    {
      get: async () => ({ stream: Readable.from([input]) }),
      put: async () => undefined,
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    } as never,
  );
  await worker.processPendingJobs();
  assert.deepEqual(deleted, ['original/preview/2.jpg']);
});
