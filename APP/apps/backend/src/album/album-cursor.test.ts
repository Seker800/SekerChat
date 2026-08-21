import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeAlbumCursor, encodeAlbumCursor } from './album-cursor';

test('album cursor round trips createdAt and id', () => {
  const value = { createdAt: new Date('2026-08-13T01:02:03.000Z'), id: 'photo-id' };
  assert.deepEqual(decodeAlbumCursor(encodeAlbumCursor(value)), value);
});

test('album cursor rejects invalid payloads', () => {
  assert.throws(() => decodeAlbumCursor('not-a-cursor'));
});
