import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from './async-pool';

describe('mapWithConcurrency', () => {
  it('caps concurrent work and preserves input order', async () => {
    let active = 0;
    let peak = 0;
    const resultPromise = mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => window.setTimeout(resolve, value % 2 === 0 ? 2 : 8));
      active -= 1;
      return value * 10;
    });

    await Promise.resolve();
    expect(active).toBe(2);
    await expect(resultPromise).resolves.toEqual([10, 20, 30, 40]);
    expect(peak).toBe(2);
  });

  it('falls back to one worker for an invalid concurrency value', async () => {
    await expect(mapWithConcurrency([1, 2], Number.NaN, async (value) => value))
      .resolves.toEqual([1, 2]);
  });
});
