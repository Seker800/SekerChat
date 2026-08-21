import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import sharp from 'sharp';
import { createImageProcessor, MAX_IMAGE_INPUT_PIXELS } from './image-processing-policy';

test('image processing policy accepts normal PNG, JPEG, WebP, and GIF inputs', async () => {
  for (const format of ['png', 'jpeg', 'webp', 'gif'] as const) {
    const input = await sharp({
      create: { width: 8, height: 6, channels: 4, background: '#336699' },
    }).toFormat(format).toBuffer();
    const metadata = await createImageProcessor(input).metadata();
    assert.equal(metadata.width, 8);
    assert.equal(metadata.height, 6);
  }
});

test('image processing policy rejects malformed and oversized image inputs', async () => {
  await assert.rejects(createImageProcessor(Buffer.from('not-an-image')).metadata());

  const oversizedSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${MAX_IMAGE_INPUT_PIXELS}" height="2"/>`,
  );
  await assert.rejects(createImageProcessor(oversizedSvg).metadata(), /pixel limit/i);
});
