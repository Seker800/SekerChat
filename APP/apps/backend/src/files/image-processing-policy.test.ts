import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createImageProcessor } from './image-processing-policy';

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
