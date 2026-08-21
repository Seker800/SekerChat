import { describe, expect, it } from 'vitest';
import { getMessageImageShellLayout } from './messageImageSizing';

describe('getMessageImageShellLayout', () => {
  it('constrains a landscape image inside the existing message envelope', () => {
    expect(getMessageImageShellLayout(1200, 600)).toEqual({
      aspectRatio: '420 / 210',
      heightPx: 210,
      widthPx: 420,
    });
  });

  it('constrains a portrait image by max height while preserving ratio', () => {
    expect(getMessageImageShellLayout(600, 1200)).toEqual({
      aspectRatio: '160 / 320',
      heightPx: 320,
      widthPx: 160,
    });
  });

  it('falls back to a stable shell bucket when intrinsic size is unavailable', () => {
    expect(getMessageImageShellLayout(null, null)).toEqual({
      aspectRatio: '320 / 160',
      heightPx: 160,
      widthPx: 320,
    });
  });
});
