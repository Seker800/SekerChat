import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { FilePreviewJobService } from './file-preview-job.service';
import { previewJobForImage, previewStatus } from './file-preview-state';

const job = { fileId: 'file', attempts: 2, leaseVersion: 4 };

test('durable preview failures retain errors across retries and stop after repeated failures', async () => {
  const changes: any[] = [];
  const jobs = new FilePreviewJobService({
    filePreviewJob: {
      updateMany: async (input: unknown) => {
        changes.push(input);
        return { count: 1 };
      },
    },
  } as never);
  await jobs.fail(job, new Error('decoder failed'));
  await jobs.fail({ ...job, attempts: 5 }, new Error('still corrupt'));
  assert.equal(changes[0].data.status, 'PENDING');
  assert.equal(changes[0].data.lastError, 'decoder failed');
  assert.equal(changes[1].data.status, 'FAILED');
  assert.equal(changes[1].data.lastError, 'still corrupt');
  assert.deepEqual(changes[0].where, { fileId: 'file', leaseVersion: 4, status: 'PROCESSING' });
});

test('expired completion cannot overwrite file metadata', async () => {
  const jobs = new FilePreviewJobService({
    $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        filePreviewJob: { updateMany: async () => ({ count: 0 }) },
        fileObject: { update: () => assert.fail('expired worker changed file') },
      }),
  } as never);
  assert.equal(await jobs.complete(job, { imageWidth: 100, imageHeight: 100 }), false);
});

test('completion stores dimensions and ready state in the same transaction', async () => {
  const changes: any[] = [];
  const jobs = new FilePreviewJobService({
    $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      run({
        filePreviewJob: {
          updateMany: async (x: unknown) => {
            changes.push(x);
            return { count: 1 };
          },
        },
        fileObject: { update: async (x: unknown) => changes.push(x) },
      }),
  } as never);
  assert.equal(await jobs.complete(job, { imageWidth: 100, imageHeight: 200 }), true);
  assert.equal(changes[0].data.status, 'READY');
  assert.equal(changes[0].data.lastError, null);
  assert.equal(changes[1].data.imageHeight, 200);
});

test('lease heartbeat distinguishes current and expired workers', async () => {
  let count = 1;
  const jobs = new FilePreviewJobService({
    filePreviewJob: { updateMany: async () => ({ count: count-- }) },
  } as never);
  assert.equal(await jobs.heartbeat(job), true);
  assert.equal(await jobs.heartbeat(job), false);
});

test('images enqueue durable work and status remains explicit when unavailable', () => {
  assert.deepEqual(previewJobForImage('image/png'), { create: {} });
  assert.equal(previewJobForImage('application/pdf'), undefined);
  assert.equal(previewStatus(null), 'UNAVAILABLE');
  assert.equal(previewStatus(null, 'thumb'), 'READY');
  assert.equal(previewStatus({ status: 'FAILED', attempts: 5 }), 'FAILED');
});
