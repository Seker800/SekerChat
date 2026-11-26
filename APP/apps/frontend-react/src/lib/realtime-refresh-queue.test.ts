import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { RealtimeRefreshQueue } from './realtime-refresh-queue';

it('coalesces changes during a slow read into one trailing read, with no overlap', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let finish!: (value: number) => void;
  let active = 0;
  let maximum = 0;
  const read = vi.fn(async () => {
    active++;
    maximum = Math.max(maximum, active);
    const value =
      read.mock.calls.length === 1
        ? await new Promise<number>((resolve) => {
            finish = resolve;
          })
        : 2;
    active--;
    return value;
  });
  const observer = new QueryObserver(client, { queryKey: ['tasks', 'g'], queryFn: read });
  const unsubscribe = observer.subscribe(() => {});
  const queue = new RealtimeRefreshQueue(client, () => true);
  const first = queue.invalidate({ queryKey: ['tasks', 'g'] });
  const second = queue.invalidate({ queryKey: ['tasks', 'g'] });
  expect(read).toHaveBeenCalledTimes(1);
  finish(1);
  await Promise.all([first, second]);
  expect(read).toHaveBeenCalledTimes(2);
  expect(maximum).toBe(1);
  expect(client.getQueryData(['tasks', 'g'])).toBe(2);
  unsubscribe();
  queue.dispose();
  client.clear();
});

it('retains hidden-window changes even when an older HTTP read completes afterwards', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let visible = false;
  let finish!: (value: number) => void;
  const read = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(2);
  const observer = new QueryObserver(client, { queryKey: ['tasks', 'g'], queryFn: read });
  const unsubscribe = observer.subscribe(() => {});
  const queue = new RealtimeRefreshQueue(client, () => visible);
  await queue.invalidate({ queryKey: ['tasks', 'g'] });
  finish(1);
  await client.getQueryCache().find({ queryKey: ['tasks', 'g'] })?.promise;
  expect(read).toHaveBeenCalledTimes(1);
  visible = true;
  queue.flush();
  await client.getQueryCache().find({ queryKey: ['tasks', 'g'] })?.promise;
  expect(read).toHaveBeenCalledTimes(2);
  unsubscribe();
  queue.dispose();
  client.clear();
});

it('merges scheduled low-urgency refreshes into one read per window', async () => {
  vi.useFakeTimers();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const read = vi.fn().mockResolvedValue(1);
  const observer = new QueryObserver(client, { queryKey: ['activity', 'g'], queryFn: read });
  const unsubscribe = observer.subscribe(() => {});
  const queue = new RealtimeRefreshQueue(client, () => true);
  await client.getQueryCache().find({ queryKey: ['activity', 'g'] })?.promise;
  read.mockClear();

  queue.schedule({ queryKey: ['activity', 'g'] }, 30_000);
  queue.schedule({ queryKey: ['activity', 'g'] }, 30_000);
  queue.schedule({ queryKey: ['activity', 'g'] }, 30_000);
  expect(read).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(30_000);
  expect(read).toHaveBeenCalledTimes(1);

  unsubscribe();
  queue.dispose();
  client.clear();
  vi.useRealTimers();
});
