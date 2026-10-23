import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { access, readFile } from 'node:fs/promises';
import { withStoredImage } from './stored-image-processing';

test('stored images serialize native processing, clean temporary files, and recover after failure', async () => {
  let active = 0;
  let maximum = 0;
  const paths: string[] = [];
  const storage = { get: async () => ({ stream: Readable.from(['image']) }) };
  const process = async (path: string) => {
    paths.push(path);
    maximum = Math.max(maximum, ++active);
    assert.equal(await readFile(path, 'utf8'), 'image');
    await new Promise((resolve) => setTimeout(resolve, 10));
    active--;
    if (paths.length === 1) throw new Error('decode failure');
    return 'ok';
  };
  const results = await Promise.allSettled([
    withStoredImage(storage as never, 'one', process),
    withStoredImage(storage as never, 'two', process),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(maximum, 1);
  for (const path of paths) await assert.rejects(access(path));
});
