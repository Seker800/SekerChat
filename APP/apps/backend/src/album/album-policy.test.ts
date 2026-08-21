import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAlbumTags } from './album-policy';

test('normalizeAlbumTags normalizes unicode, whitespace and case-insensitive duplicates', () => {
  assert.deepEqual(normalizeAlbumTags(['  团   建 ', 'ＴＥＳＴ', 'test']), ['团 建', 'TEST']);
});

test('normalizeAlbumTags rejects too many and too long tags', () => {
  assert.throws(() => normalizeAlbumTags(Array.from({ length: 11 }, (_, index) => `tag-${index}`)));
  assert.throws(() => normalizeAlbumTags(['x'.repeat(25)]));
});
