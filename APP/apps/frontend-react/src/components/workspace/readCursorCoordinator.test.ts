import { describe, expect, it, vi } from 'vitest';
import { ReadCursorCoordinator } from './readCursorCoordinator';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ReadCursorCoordinator', () => {
  it('coalesces observations while one cursor update is in flight', async () => {
    const first = deferred<void>();
    const send = vi
      .fn<(groupId: string, cursor: string) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const coordinator = new ReadCursorCoordinator(send);

    coordinator.observe('group-1', '10');
    coordinator.observe('group-1', '11');
    coordinator.observe('group-1', '12');

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenNthCalledWith(1, 'group-1', '10');

    first.resolve();
    await coordinator.whenIdle('group-1');

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, 'group-1', '12');
  });

  it('does not resend an acknowledged cursor', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const coordinator = new ReadCursorCoordinator(send);

    coordinator.observe('group-1', '10');
    await coordinator.whenIdle('group-1');
    coordinator.observe('group-1', '10');
    await coordinator.whenIdle('group-1');

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('reports a failed group and allows a later observation to retry', async () => {
    const send = vi
      .fn<(groupId: string, cursor: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const reportError = vi.fn();
    const coordinator = new ReadCursorCoordinator(send, reportError);

    coordinator.observe('group-1', '10');
    await coordinator.whenIdle('group-1');

    expect(reportError).toHaveBeenCalledWith(expect.any(Error), 'group-1');

    coordinator.observe('group-1', '10');
    await coordinator.whenIdle('group-1');

    expect(send).toHaveBeenCalledTimes(2);
  });
});
