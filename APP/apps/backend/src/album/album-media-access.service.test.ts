import assert from 'node:assert/strict';
import test from 'node:test';
import { AlbumMediaAccessService } from './album-media-access.service';

function createService() {
  return new AlbumMediaAccessService({
    getOrThrow: () => 'a-long-test-secret-for-album-media',
  } as never);
}

test('album media tickets carry a short-lived authenticated object reference', () => {
  const service = createService();
  const now = Date.parse('2026-08-13T08:00:00Z');
  const ticket = service.issue('album/thumbnails/photo-1.jpg', 'image/jpeg', now);

  const decoded = service.verify(ticket, now + 60_000);
  assert.deepEqual(decoded, {
    v: 1,
    key: 'album/thumbnails/photo-1.jpg',
    mimeType: 'image/jpeg',
    expiresAt: Math.floor(now / 600_000 + 2) * 600,
  });
  assert.equal(service.verify(ticket, decoded!.expiresAt * 1_000), null);
});

test('album media tickets remain stable within a browser cache window', () => {
  const service = createService();
  const now = Date.parse('2026-08-13T08:03:00Z');

  assert.equal(
    service.issue('album/thumbnails/photo-1.jpg', 'image/jpeg', now),
    service.issue('album/thumbnails/photo-1.jpg', 'image/jpeg', now + 5 * 60_000),
  );
});

test('album media tickets reject tampering and non-album object keys', () => {
  const service = createService();
  const ticket = service.issue('album/originals/photo-1', 'image/webp');
  assert.equal(service.verify(`${ticket}x`), null);
  assert.equal(service.verify(service.issue('groups/private/file', 'image/webp')), null);
});

test('album media tickets allow authenticated MP4 originals', () => {
  const service = createService();
  const now = Date.parse('2026-08-13T08:00:00Z');
  const ticket = service.issue('album/originals/video-1', 'video/mp4', now);

  assert.deepEqual(service.verify(ticket, now + 60_000), {
    v: 1,
    key: 'album/originals/video-1',
    mimeType: 'video/mp4',
    expiresAt: Math.floor(now / 600_000 + 2) * 600,
  });
});
