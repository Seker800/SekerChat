import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, focusManager, useQuery } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOwnCheckInController } from './useOwnCheckInController';
import { SubscriptionViewRefresh } from '../../lib/subscription-refresh';
import { QueryObserver } from '@tanstack/react-query';

const api = vi.hoisted(() => ({ today: vi.fn(), post: vi.fn() }));
vi.mock('../../lib/attendance-api', () => ({
  fetchOwnCheckInToday: api.today,
  checkIn: vi.fn(),
  checkOut: vi.fn(),
}));
vi.mock('../../lib/subscriptions-api', () => ({ getSubscriptionPost: api.post }));
let client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  api.today.mockResolvedValue({
    workDate: '2026-11-01',
    status: 'NOT_CHECKED_IN',
    checkInMinutes: 0,
    onlineMinutes: 0,
  });
  api.post.mockResolvedValue({ id: 'post-1', viewCount: 9 });
  focusManager.setFocused(true);
});
afterEach(() => {
  client.clear();
  focusManager.setFocused(undefined);
  vi.useRealTimers();
  vi.clearAllMocks();
});
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

it('checks today once a minute for ten minutes without refetching history or duplicating observers', async () => {
  const history = vi.fn().mockResolvedValue({ range: { endDate: '2026-11-01' } });
  const { result } = renderHook(
    () => {
      useOwnCheckInController('token');
      const controller = useOwnCheckInController('token');
      useQuery({
        queryKey: ['attendance', 'me', 'checkin-panel', 365],
        queryFn: history,
        staleTime: Infinity,
      });
      return controller;
    },
    { wrapper },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600_000);
  });
  expect(api.today).toHaveBeenCalledTimes(11);
  expect(history).toHaveBeenCalledTimes(1);
  api.today.mockResolvedValue({
    workDate: '2026-11-01',
    status: 'CHECKED_IN',
    checkInMinutes: 1,
    onlineMinutes: 1,
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(result.current.today?.status).toBe('CHECKED_IN');
  expect(history).toHaveBeenCalledTimes(1);
});

it('pauses ten minutes in the background and reconciles once on return', async () => {
  renderHook(() => useOwnCheckInController('token'), { wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  act(() => focusManager.setFocused(false));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600_000);
  });
  expect(api.today).toHaveBeenCalledTimes(1);
  await act(async () => {
    focusManager.setFocused(true);
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(api.today).toHaveBeenCalledTimes(2);
});

it('does not overlap a slow today request', async () => {
  let finish!: (value: unknown) => void;
  api.today.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  renderHook(() => useOwnCheckInController('token'), { wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300_000);
  });
  expect(api.today).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ workDate: '2026-11-01' });
    await vi.advanceTimersByTimeAsync(1);
  });
});

it('updates one article across twelve loaded pages without fetching the pages or dropping cursors', async () => {
  const pageFn = vi.fn();
  const pages = Array.from({ length: 12 }, (_, index) => ({
    items: [{ id: `post-${index}`, viewCount: 0 }],
    nextCursor: `cursor-${index}`,
  }));
  const data = { pages, pageParams: pages.map((_, index) => `cursor-${index}`) };
  client.setQueryData(['subscriptions'], data);
  const observer = new QueryObserver(client, {
    queryKey: ['subscriptions'],
    queryFn: pageFn,
    staleTime: Infinity,
  });
  const unsubscribe = observer.subscribe(() => {});
  await new SubscriptionViewRefresh(client, 'token').refresh('post-1');
  const updated = client.getQueryData<typeof data>(['subscriptions'])!;
  expect(pageFn).not.toHaveBeenCalled();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(updated.pages).toHaveLength(12);
  expect(updated.pages[1].items[0].viewCount).toBe(9);
  expect(updated.pageParams).toEqual(data.pageParams);
  expect(updated.pages[11].nextCursor).toBe('cursor-11');
  unsubscribe();
});

it('retains article changes arriving during a slow request and serializes the follow-up', async () => {
  const observer = new QueryObserver(client, {
    queryKey: ['subscriptions', 'detail', 'post-1'],
    enabled: true,
    staleTime: Infinity,
    initialData: { id: 'post-1', viewCount: 1 },
  });
  const unsubscribe = observer.subscribe(() => {});
  let finish!: (value: unknown) => void;
  api.post
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ id: 'post-1', viewCount: 3 });
  const refresh = new SubscriptionViewRefresh(client, 'token');
  const first = refresh.refresh('post-1');
  const second = refresh.refresh('post-1');
  expect(api.post).toHaveBeenCalledTimes(1);
  finish({ id: 'post-1', viewCount: 2 });
  await Promise.all([first, second]);
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(client.getQueryData(['subscriptions', 'detail', 'post-1'])).toMatchObject({
    viewCount: 3,
  });
  refresh.dispose();
  await refresh.refresh('post-1');
  expect(api.post).toHaveBeenCalledTimes(2);
  unsubscribe();
});
