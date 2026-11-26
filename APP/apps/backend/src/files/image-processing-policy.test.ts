import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  assertWithinImageDecodeBudget,
  createImageProcessor,
  estimateDecodedBytes,
  IMAGE_MAX_DECODED_BYTES,
  IMAGE_MAX_INPUT_PIXELS,
  ImageDecodeBudgetExceededError,
  readImageHeaderMetadata,
} from './image-processing-policy';

test('image processing policy accepts normal PNG, JPEG, WebP, and GIF inputs', async () => {
  for (const format of ['png', 'jpeg', 'webp', 'gif'] as const) {
    const input = await sharp({
      create: { width: 8, height: 6, channels: 4, background: '#336699' },
    })
      .toFormat(format)
      .toBuffer();
    const metadata = await createImageProcessor(input).metadata();
    assert.equal(metadata.width, 8);
    assert.equal(metadata.height, 6);
  }
});

test('image processing accepts large working images and rejects corrupt inputs', async () => {
  await assert.rejects(createImageProcessor(Buffer.from('not-an-image')).metadata());
  const input = await sharp({
    create: { width: 6800, height: 11027, channels: 3, background: 'white' },
  })
    .png()
    .toBuffer();
  const thumbnail = await createImageProcessor(input).resize({ width: 400 }).jpeg().toBuffer();
  assert.equal((await sharp(thumbnail).metadata()).width, 400);
  assert.ok(thumbnail.length < 100_000);
});

test('image decode budget rejects extreme pixel counts without decoding', () => {
  assert.throws(
    () => assertWithinImageDecodeBudget({ width: 300_000, height: 1_000, channels: 3 }),
    ImageDecodeBudgetExceededError,
  );
  assert.throws(
    () => assertWithinImageDecodeBudget({ width: IMAGE_MAX_INPUT_PIXELS + 1, height: 1 }),
    ImageDecodeBudgetExceededError,
  );
});

test('image decode budget accounts for 16-bit channels', () => {
  // 10000 x 10000 x 4 channels x 2 bytes = 800 MB, above the 600 MB budget.
  assert.equal(
    estimateDecodedBytes({ width: 10_000, height: 10_000, channels: 4, depth: 'ushort' }),
    800_000_000,
  );
  assert.throws(
    () =>
      assertWithinImageDecodeBudget({
        width: 10_000,
        height: 10_000,
        channels: 4,
        depth: 'ushort',
      }),
    ImageDecodeBudgetExceededError,
  );
  assert.ok(estimateDecodedBytes({ width: 100, height: 100, channels: 3 }) < IMAGE_MAX_DECODED_BYTES);
});

