import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { ImageMetadataService } from './image-metadata.service';

test('metadata reads large objects through disk without a separate image size restriction', async () => {
  const png = await sharp({ create: { width: 4, height: 3, channels: 3, background: 'white' } })
    .png()
    .toBuffer();
  const stream = Readable.from(
    (async function* () {
      yield png;
      const padding = Buffer.alloc(1024 * 1024);
      for (let i = 0; i < 51; i++) yield padding;
    })(),
  );
  const service = new ImageMetadataService({
    get: async () => ({ stream, contentLength: 51 * 1024 * 1024 + png.length }),
  } as never);
  assert.deepEqual(await service.fromObject('large', 'image/png'), { width: 4, height: 3 });
  assert.equal(stream.destroyed, true);
});

test('serializing legacy dimensions never reads originals or writes to the database', async () => {
  let reads = 0;
  const service = new ImageMetadataService({
    get: () => {
      reads++;
      throw new Error('unexpected original read');
    },
  } as never);
  assert.deepEqual(
    await service.resolve({
      id: 'legacy',
      groupId: 'g',
      storageKey: 'large',
      mimeType: 'image/png',
      imageWidth: null,
      imageHeight: null,
    }),
    { width: null, height: null },
  );
  assert.equal(reads, 0);
});

test('metadata skips active formats without contacting storage', async () => {
  const service = new ImageMetadataService({
    get: () => assert.fail('active image read'),
  } as never);
  assert.equal(await service.fromObject('active', 'image/svg+xml'), null);
});
