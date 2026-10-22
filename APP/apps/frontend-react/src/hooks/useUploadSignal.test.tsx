import { renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useUploadSignal } from './useUploadSignal';

it('cancels requests when their owner unmounts and gives each scope a fresh signal', () => {
  const { result, rerender, unmount } = renderHook(({ scope }) => useUploadSignal(scope), { initialProps: { scope: 'group-a' } });
  const first = result.current();
  rerender({ scope: 'group-b' });
  expect(first.aborted).toBe(true);
  const second = result.current();
  expect(second.aborted).toBe(false);
  unmount();
  expect(second.aborted).toBe(true);
});
