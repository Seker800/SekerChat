import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MessageResponse } from '../lib/messages-files-api';
import { useRealtime, upsertMessageInCache } from './useRealtime';

const realtimeUrlMocks = vi.hoisted(() => ({
  createRealtimeUrl: vi.fn(() => 'ws://localhost/realtime'),
}));

vi.mock('../lib/api-core', () => realtimeUrlMocks);

const message: MessageResponse = {
  id: 'message-1',
  groupId: 'group-1',
  senderId: 'user-1',
  type: 'text',
  text: 'hello',
  mentionedUserIds: [],
  replyTo: null,
  attachment: null,
  readReceipt: null,
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-05-12T08:00:00.000Z',
  sender: {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'User',
    avatarUrl: null,
  },
};

describe('upsertMessageInCache', () => {
  it('preserves stable optimistic render keys when realtime updates an existing message', () => {
    const result = upsertMessageInCache(
      {
        groupId: 'group-1',
        items: [{ ...message, clientKey: 'text-local-1', text: 'hello local' }],
      },
      'group-1',
      { ...message, text: 'hello server' },
    );

    expect(result.items[0]).toMatchObject({
      id: 'message-1',
      clientKey: 'text-local-1',
      text: 'hello server',
    });
  });
});

class MockWebSocket extends EventTarget {
  static instances: MockWebSocket[] = [];

  constructor(public readonly url: string) {
    super();
    MockWebSocket.instances.push(this);
  }

  close = vi.fn();
}

describe('useRealtime', () => {
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    MockWebSocket.instances = [];
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not backfill queries on the initial socket connection', () => {
    vi.useFakeTimers();
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useRealtime('access-token', 'group-1', 'user-1', undefined, undefined), {
      wrapper,
    });

    expect(realtimeUrlMocks.createRealtimeUrl).toHaveBeenCalledWith();
    expect(MockWebSocket.instances[0]?.url).toBe('ws://localhost/realtime');

    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(new Event('open'));
    });

    expect(invalidateSpy).not.toHaveBeenCalled();

    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(new Event('close'));
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    act(() => {
      MockWebSocket.instances[1]?.dispatchEvent(new Event('open'));
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages', 'group-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['groups'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dms'] });
  });

  it('does not reconnect after an unauthorized close', () => {
    vi.useFakeTimers();
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useRealtime('access-token', 'group-1', 'user-1', undefined, undefined), {
      wrapper,
    });

    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(
        new CloseEvent('close', { code: 4401, reason: 'Unauthorized' }),
      );
      vi.advanceTimersByTime(3000);
    });

    expect(errorSpy).toHaveBeenCalledWith('[realtime] unauthorized, not reconnecting');
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('refreshes only the affected message list when a file share changes', () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useRealtime('access-token', 'group-1', 'user-1'), { wrapper });

    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            eventVersion: 1,
            eventId: 'event-1',
            type: 'group.updated.v1',
            groupId: 'group-1',
            occurredAt: '2026-08-10T10:00:00.000Z',
            payload: { groupId: 'group-1', reason: 'file_share_updated' },
          }),
        }),
      );
    });

    expect(invalidateSpy).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages', 'group-1'] });
  });

  it('applies an at-least-once realtime event only once during the client session', () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['groups'], [
      { id: 'group-1', unreadCount: 0, latestMessage: null, members: [] },
    ]);
    const onMessageCreated = vi.fn();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useRealtime('', '', 'user-2', onMessageCreated), { wrapper });
    const realtimeEvent = new MessageEvent('message', {
      data: JSON.stringify({
        eventVersion: 1,
        eventId: 'message-created:message-1',
        type: 'message.created.v1',
        groupId: 'group-1',
        occurredAt: '2026-08-12T10:00:00.000Z',
        payload: message,
      }),
    });

    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(realtimeEvent);
      MockWebSocket.instances[0]?.dispatchEvent(realtimeEvent);
    });

    expect(queryClient.getQueryData<any[]>(['groups'])?.[0]?.unreadCount).toBe(1);
    expect(onMessageCreated).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed events before they can write to the query cache', () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const setQueryDataSpy = vi.spyOn(queryClient, 'setQueryData');
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useRealtime('access-token', 'group-1', 'user-1'), { wrapper });
    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            eventVersion: 1,
            eventId: 'bad-1',
            type: 'message.created.v1',
            groupId: 'group-1',
            occurredAt: 'not-a-date',
            payload: { id: 123 },
          }),
        }),
      );
    });

    expect(setQueryDataSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['messages', 'group-1'] });
  });

  it('logs an unsupported event version once and falls back to query invalidation', () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useRealtime('access-token', 'group-1', 'user-1'), { wrapper });
    const futureEvent = new MessageEvent('message', {
      data: JSON.stringify({ eventVersion: 2, eventId: 'future', type: 'message.created.v2' }),
    });
    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(futureEvent);
      MockWebSocket.instances[0]?.dispatchEvent(futureEvent);
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[realtime] rejected event',
      expect.objectContaining({ kind: 'unsupported_version' }),
    );
  });

  it('patches presence locally without refetching group queries', () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['groups'], [
      {
        id: 'group-1',
        members: [{ userId: 'user-2', isOnline: false, isDnd: false }],
      },
    ]);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useRealtime('access-token', 'group-1', 'user-1'), { wrapper });
    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            eventVersion: 1,
            eventId: 'presence-1',
            type: 'presence.changed.v1',
            groupId: '',
            occurredAt: '2026-08-12T10:00:00.000Z',
            payload: { userId: 'user-2', online: true, isDnd: true },
          }),
        }),
      );
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(queryClient.getQueryData<any[]>(['groups'])?.[0]?.members[0]).toMatchObject({
      userId: 'user-2',
      isOnline: true,
      isDnd: true,
    });
  });

  it('patches cached read receipts without refetching messages', () => {
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['messages', 'group-1'], {
      groupId: 'group-1',
      items: [
        {
          ...message,
          eventSequence: '10',
          senderId: 'user-1',
          readReceipt: {
            totalRecipients: 1,
            readCount: 0,
            unreadCount: 1,
            readBy: [],
            unreadBy: [
              { userId: 'user-2', email: 'reader@example.com', displayName: 'Reader', avatarUrl: null },
            ],
          },
        },
      ],
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(() => useRealtime('access-token', 'group-1', 'user-1'), { wrapper });
    act(() => {
      MockWebSocket.instances[0]?.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            eventVersion: 1,
            eventId: 'read-cursor:group-1:user-2:10',
            type: 'message.read-cursor.changed.v1',
            groupId: 'group-1',
            occurredAt: '2026-08-12T10:00:00.000Z',
            payload: { userId: 'user-2', lastReadEventSequence: '10' },
          }),
        }),
      );
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
    const cached = queryClient.getQueryData<any>(['messages', 'group-1']);
    expect(cached.items[0].readReceipt).toMatchObject({ readCount: 1, unreadCount: 0 });
    expect(cached.items[0].readReceipt.readBy[0].userId).toBe('user-2');
  });
});
