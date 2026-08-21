import { describe, expect, it } from 'vitest';
import {
  buildAlbumViewportIndex,
  getAlbumColumnCount,
  layoutAlbumPhotos,
  selectVisibleAlbumPhotos,
  selectVisibleAlbumPhotosFromIndex,
} from './album-layout';

describe('album masonry layout', () => {
  it('uses responsive column counts', () => {
    expect(getAlbumColumnCount(440)).toBe(2);
    expect(getAlbumColumnCount(760)).toBe(3);
    expect(getAlbumColumnCount(1100)).toBe(4);
    expect(getAlbumColumnCount(1500)).toBe(5);
  });

  it('places each photo into the shortest column while preserving ratio', () => {
    const layout = layoutAlbumPhotos(
      [
        { id: 'portrait', width: 100, height: 200 },
        { id: 'landscape', width: 200, height: 100 },
        { id: 'square', width: 100, height: 100 },
      ],
      { containerWidth: 410, columnCount: 2, gap: 10 },
    );

    expect(layout.columnWidth).toBe(200);
    expect(layout.items.map((item) => [item.id, item.column, item.height])).toEqual([
      ['portrait', 0, 400],
      ['landscape', 1, 100],
      ['square', 1, 200],
    ]);
  });

  it('keeps a bounded render window for a very large album', () => {
    const photos = Array.from({ length: 10_000 }, (_, index) => ({
      id: `photo-${index}`,
      width: 400,
      height: 300 + (index % 5) * 40,
    }));
    const layout = layoutAlbumPhotos(photos, {
      containerWidth: 1200,
      columnCount: 4,
      gap: 10,
    });

    const visible = selectVisibleAlbumPhotos(layout.items, {
      scrollTop: 120_000,
      viewportHeight: 900,
      overscan: 1_800,
    });

    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(100);
    expect(visible.every((photo) => photo.top + photo.height >= 118_200)).toBe(true);
    expect(visible.every((photo) => photo.top <= 122_700)).toBe(true);

    const indexedVisible = selectVisibleAlbumPhotosFromIndex(
      buildAlbumViewportIndex(layout.items),
      { scrollTop: 120_000, viewportHeight: 900, overscan: 1_800 },
    );
    expect(indexedVisible.map((photo) => photo.id).sort()).toEqual(
      visible.map((photo) => photo.id).sort(),
    );
  });

  it('indexes fifty thousand photos without turning viewport scans into full-list work', () => {
    const photos = Array.from({ length: 50_000 }, (_, index) => ({
      id: `scale-${index}`,
      width: 400,
      height: 250 + (index % 11) * 50,
    }));
    const startedAt = performance.now();
    const layout = layoutAlbumPhotos(photos, {
      containerWidth: 1440,
      columnCount: 5,
      gap: 10,
    });
    const index = buildAlbumViewportIndex(layout.items);
    const visible = selectVisibleAlbumPhotosFromIndex(index, {
      scrollTop: 500_000,
      viewportHeight: 900,
      overscan: 1_800,
    });

    expect(performance.now() - startedAt).toBeLessThan(1_000);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(150);
    expect(index.buckets.size).toBeLessThan(5_000);
  });
});
