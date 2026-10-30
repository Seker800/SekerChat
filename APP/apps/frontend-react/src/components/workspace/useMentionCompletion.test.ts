import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useMentionCompletion } from './useMentionCompletion';

for (const members of [
  [{ userId: 'u1', displayName: '张 三', email: 'a@example.test' }],
  [
    { userId: 'u1', displayName: '同事', email: 'a@example.test' },
    { userId: 'u2', displayName: '同事', email: 'b@example.test' },
  ],
  [
    { userId: 'u1', displayName: 'b', email: 'a@example.test' },
    { userId: 'u2', displayName: '其他', email: 'b@example.test' },
  ],
]) {
  it(`inserts an unambiguous email when the chosen label is unsafe: ${members[0]!.displayName}`, () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useMentionCompletion('@', members, onChange));
    result.current.select(members[0]!);
    expect(onChange).toHaveBeenCalledWith('@a@example.test ');
  });
}
