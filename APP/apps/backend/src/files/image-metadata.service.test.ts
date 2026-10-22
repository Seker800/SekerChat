import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { ImageMetadataService } from './image-metadata.service';

const maxBytes = 50 * 1024 * 1024;

test('metadata rejects oversized objects before reading their body', async () => {
  let read = false;
  const stream = Readable.from((async function* () { read = true; yield Buffer.from('x'); })());
  const service = new ImageMetadataService({} as never, {
    get: async () => ({ stream, contentLength: maxBytes + 1 }),
  } as never);
  await assert.rejects(() => service.fromObject('large', 'image/png'), /50MB/);
  assert.equal(read, false);
  assert.equal(stream.destroyed, true);
});

test('metadata bounds the stream even when storage reports an incorrect length', async () => {
  const stream = Readable.from((async function* () {
    const chunk = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < 51; i++) yield chunk;
  })());
  const service = new ImageMetadataService({} as never, {
    get: async () => ({ stream, contentLength: 1 }),
  } as never);
  await assert.rejects(() => service.fromObject('large', 'image/png'), /50MB/);
  assert.equal(stream.destroyed, true);
});

test('bounded metadata still reads a valid image and skips untrusted active formats', async () => {
  const buffer = await sharp({ create: { width: 4, height: 3, channels: 3, background: 'white' } }).png().toBuffer();
  let reads = 0;
  const service = new ImageMetadataService({} as never, {
    get: async () => { reads++; return { stream: Readable.from([buffer]), contentLength: buffer.length }; },
  } as never);
  assert.deepEqual(await service.fromObject('small', 'image/png'), { width: 4, height: 3 });
  assert.equal(await service.fromObject('active', 'image/svg+xml'), null);
  assert.equal(reads, 1);
});
