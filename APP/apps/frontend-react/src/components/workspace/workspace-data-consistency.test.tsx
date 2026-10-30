import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useRealtime } from '../../hooks/useRealtime';
import { useMessageList } from './useMessageList';
import { useComposer } from './useComposer';
import { useManagePanel } from './useManagePanel';
import { useWorkspaceStore } from '../../store/workspace-store';
import type { GroupResponse } from '../../lib/groups-api';
import type { MessageResponse, MessageListResponse } from '../../lib/messages-files-api';

const mocks = vi.hoisted(() => ({
  listMessages: vi.fn(),
  updateGroup: vi.fn(),
  setWorkState: vi.fn(),
  invite: vi.fn(),
  remove: vi.fn(),
  archive: vi.fn(),
  advanceCursor: vi.fn(),
}));
vi.mock('../../lib/messages-files-api', async () => ({
  ...(await vi.importActual('../../lib/messages-files-api')),
  listMessages: mocks.listMessages,
}));
vi.mock('../../lib/groups-api', async () => ({
  ...(await vi.importActual('../../lib/groups-api')),
  updateGroup: mocks.updateGroup,
  inviteGroupMember: mocks.invite,
  removeGroupMember: mocks.remove,
  archiveGroup: mocks.archive,
  advanceReadCursor: mocks.advanceCursor,
}));
vi.mock('../../lib/ops-api', async () => ({
  ...(await vi.importActual('../../lib/ops-api')),
  setGroupWorkState: mocks.setWorkState,
}));

const message = (id: string, sequence = '1'): MessageResponse => ({
  id,
  groupId: 'a',
  eventSequence: sequence,
  type: 'text',
  text: id,
  senderId: 'me',
  mentionedUserIds: [],
  replyTo: null,
  attachment: null,
  readReceipt: null,
  revokedAt: null,
  editedAt: null,
  createdAt: '2026-10-30T00:00:00Z',
  sender: { id: 'me', email: 'x@example.test', displayName: null, avatarUrl: null },
});
const group = (id: string) =>
  ({ id, name: `${id} name`, serverId: 's', members: [] }) as unknown as GroupResponse;
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}
class Socket extends EventTarget {
  static instances: Socket[] = [];
  close = vi.fn();
  constructor(_url: string | URL) {
    super();
    Socket.instances.push(this);
  }
}
function emit(type: string, payload: MessageResponse) {
  Socket.instances
    .at(-1)!
    .dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          eventVersion: 1,
          eventId: `${type}:${payload.id}`,
          type,
          groupId: 'a',
          occurredAt: '2026-10-30T00:00:00Z',
          payload,
        }),
      }),
    );
}
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Socket.instances = [];
  useWorkspaceStore.getState().reset();
});

it('loads a complete page after a realtime event for an unopened conversation', async () => {
  const { client, wrapper } = setup();
  vi.stubGlobal('WebSocket', Socket);
  renderHook(() => useRealtime('token', 'b', 'me'), { wrapper });
  act(() => emit('message.created.v1', message('new', '2')));
  mocks.listMessages.mockResolvedValue({
    groupId: 'a',
    items: [message('older'), message('new', '2')],
    nextCursor: 'older-page',
  });
  const { result } = renderHook(
    () => useMessageList({ accessToken: 'token', selectedGroupId: 'a', onError: vi.fn() }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.messages).toHaveLength(2));
  expect(result.current.olderMessagesCursor).toBe('older-page');
  expect(mocks.listMessages).toHaveBeenCalledTimes(1);
});

it('keeps loaded history, pagination and failed sends when the latest page refreshes', async () => {
  const { client, wrapper } = setup();
  client.setQueryData(['messages', 'a'], {
    groupId: 'a',
    items: [
      message('history'),
      message('latest', '2'),
      { ...message('local'), eventSequence: undefined, sendError: 'offline' },
    ],
    nextCursor: 'oldest-page',
  });
  mocks.listMessages.mockResolvedValue({
    groupId: 'a',
    items: [message('latest', '2'), message('new', '3')],
    nextCursor: 'recent-page',
  });
  const { result } = renderHook(
    () => useMessageList({ accessToken: 'token', selectedGroupId: 'a', onError: vi.fn() }),
    { wrapper },
  );
  await act(async () => {
    await result.current.messagesQuery.refetch();
  });
  await waitFor(() =>
    expect(result.current.messages.map((x) => x.id)).toEqual(['history', 'latest', 'new', 'local']),
  );
  expect(result.current.olderMessagesCursor).toBe('oldest-page');
  expect(result.current.messages.at(-1)?.sendError).toBe('offline');
});

it('ignores an edited message outside the loaded history window', () => {
  const { client, wrapper } = setup();
  vi.stubGlobal('WebSocket', Socket);
  client.setQueryData(['messages', 'a'], {
    groupId: 'a',
    items: [message('newest', '100')],
    nextCursor: 'history',
  });
  renderHook(() => useRealtime('token', 'a', 'me'), { wrapper });
  act(() =>
    emit('message.updated.v1', { ...message('old', '5'), editedAt: '2026-10-30T00:00:00Z' }),
  );
  expect(
    client.getQueryData<MessageListResponse>(['messages', 'a'])?.items.map((x) => x.id),
  ).toEqual(['newest']);
});

it('keeps independent drafts when switching conversations and returning', () => {
  const { wrapper } = setup();
  const { result, rerender } = renderHook(
    ({ id }) =>
      useComposer({
        accessToken: 'token',
        selectedGroupId: id,
        messages: [],
        channelName: id,
        currentUser: { id: 'me', email: 'x@example.test', displayName: null, avatarUrl: null },
        onError: vi.fn(),
        refetchMessages: vi.fn(),
      }),
    { wrapper, initialProps: { id: 'a' } },
  );
  act(() => result.current.composer.onChange('draft for a'));
  rerender({ id: 'b' });
  expect(result.current.composer.text).toBe('');
  act(() => result.current.composer.onChange('draft for b'));
  rerender({ id: 'a' });
  expect(result.current.composer.text).toBe('draft for a');
  rerender({ id: 'b' });
  expect(result.current.composer.text).toBe('draft for b');
});

function manageOptions(selectedGroup: GroupResponse) {
  return {
    accessToken: 'token',
    selectedGroupId: selectedGroup.id,
    selectedGroup,
    canManageGroup: true,
    workStateData: null,
    onError: vi.fn(),
    onSuccess: vi.fn(),
    refetchGroup: vi.fn(),
    refetchGroups: vi.fn(),
    refetchWorkState: vi.fn(),
    serverOptions: [],
  };
}
it('preserves dirty settings on presence refresh and follows untouched server fields', () => {
  const { wrapper } = setup();
  const { result, rerender } = renderHook(
    ({ selectedGroup }) => useManagePanel(manageOptions(selectedGroup)),
    { wrapper, initialProps: { selectedGroup: group('a') } },
  );
  act(() => result.current.manage.onManageNameChange('unsaved input'));
  rerender({ selectedGroup: { ...group('a'), unreadCount: 1, serverId: 'new-server' } });
  expect(result.current.manage.manageName).toBe('unsaved input');
  expect(result.current.manage.manageServerId).toBe('new-server');
  rerender({ selectedGroup: group('b') });
  expect(result.current.manage.manageName).toBe('b name');
});

it('writes a completed settings request to its original group after navigation', async () => {
  const { client, wrapper } = setup();
  let resolve: (value: GroupResponse) => void = () => {};
  mocks.updateGroup.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { result, rerender } = renderHook(
    ({ selectedGroup }) => useManagePanel(manageOptions(selectedGroup)),
    { wrapper, initialProps: { selectedGroup: group('a') } },
  );
  client.setQueryData(['group', 'b'], group('b'));
  act(() => result.current.manage.onManageNameChange('a changed'));
  act(() => result.current.manage.onSaveGroup());
  await waitFor(() => expect(mocks.updateGroup).toHaveBeenCalled());
  rerender({ selectedGroup: group('b') });
  await act(async () => resolve({ ...group('a'), name: 'a changed' }));
  await waitFor(() =>
    expect(client.getQueryData(['group', 'a'])).toMatchObject({ id: 'a', name: 'a changed' }),
  );
  expect(client.getQueryData(['group', 'b'])).toMatchObject({ id: 'b', name: 'b name' });
});

it('keeps edits typed while an earlier settings save is in flight', async () => {
  const { wrapper } = setup();
  let resolve: (value: GroupResponse) => void = () => {};
  mocks.updateGroup.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { result, rerender } = renderHook(
    ({ selectedGroup }) => useManagePanel(manageOptions(selectedGroup)),
    { wrapper, initialProps: { selectedGroup: group('a') } },
  );
  act(() => result.current.manage.onManageNameChange('first'));
  act(() => result.current.manage.onSaveGroup());
  await waitFor(() => expect(mocks.updateGroup).toHaveBeenCalled());
  act(() => result.current.manage.onManageNameChange('second'));
  await act(async () => resolve({ ...group('a'), name: 'first' }));
  rerender({ selectedGroup: { ...group('a'), name: 'first' } });
  expect(result.current.manage.manageName).toBe('second');
});

it('retains a realtime message arriving during the first HTTP read', async () => {
  const { wrapper } = setup();
  vi.stubGlobal('WebSocket', Socket);
  let resolve: (page: MessageListResponse) => void = () => {};
  mocks.listMessages.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { result } = renderHook(
    () => {
      useRealtime('token', 'a', 'me');
      return useMessageList({ accessToken: 'token', selectedGroupId: 'a', onError: vi.fn() });
    },
    { wrapper },
  );
  await waitFor(() => expect(mocks.listMessages).toHaveBeenCalled());
  act(() => emit('message.created.v1', message('new', '2')));
  await act(async () =>
    resolve({ groupId: 'a', items: [message('older', '1')], nextCursor: 'history' }),
  );
  await waitFor(() =>
    expect(result.current.messages.map((item) => item.id)).toEqual(['older', 'new']),
  );
  expect(result.current.olderMessagesCursor).toBe('history');
});

it('merges an older page, keeps current edits, and can patch the original group after navigation', async () => {
  const { client, wrapper } = setup();
  client.setQueryData(['messages', 'a'], {
    groupId: 'a',
    items: [message('latest', '3')],
    nextCursor: 'older',
  });
  mocks.listMessages.mockResolvedValue({
    groupId: 'a',
    items: [message('old', '1'), message('latest', '3')],
    nextCursor: null,
  });
  const { result, rerender } = renderHook(
    ({ id }) => useMessageList({ accessToken: 'token', selectedGroupId: id, onError: vi.fn() }),
    { wrapper, initialProps: { id: 'a' } },
  );
  await act(async () => {
    await result.current.loadOlderMessages();
  });
  await waitFor(() =>
    expect(result.current.messages.map((item) => item.id)).toEqual(['old', 'latest']),
  );
  expect(result.current.olderMessagesCursor).toBeNull();
  client.setQueryData(['messages', 'b'], { groupId: 'b', items: [] });
  rerender({ id: 'b' });
  act(() =>
    result.current.patchLoadedMessage({ ...message('old', '1'), text: 'edited after switch' }),
  );
  expect(client.getQueryData<MessageListResponse>(['messages', 'a'])?.items[0]?.text).toBe(
    'edited after switch',
  );
  expect(client.getQueryData<MessageListResponse>(['messages', 'b'])?.items).toEqual([]);
});

it('shows older-page errors and allows retry without losing the current messages', async () => {
  const { client, wrapper } = setup();
  const onError = vi.fn();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  client.setQueryData(['messages', 'a'], {
    groupId: 'a',
    items: [message('latest')],
    nextCursor: 'older',
  });
  mocks.listMessages
    .mockRejectedValueOnce(new Error('history unavailable'))
    .mockResolvedValueOnce({ groupId: 'a', items: [message('old', '0')], nextCursor: null });
  const { result } = renderHook(
    () => useMessageList({ accessToken: 'token', selectedGroupId: 'a', onError }),
    { wrapper },
  );
  await act(async () => {
    await result.current.loadOlderMessages();
  });
  expect(onError).toHaveBeenCalledWith('history unavailable');
  expect(result.current.messages[0]?.id).toBe('latest');
  expect(result.current.isLoadingOlderMessages).toBe(false);
  await act(async () => {
    await result.current.loadOlderMessages();
  });
  await waitFor(() => expect(result.current.messages).toHaveLength(2));
});

it('advances only visible confirmed messages and refreshes unread state after cursor failure', async () => {
  const { client, wrapper } = setup();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.advanceCursor.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  client.setQueryData(['messages', 'a'], { groupId: 'a', items: [message('latest', '5')] });
  client.setQueryData(['groups'], [{ ...group('a'), unreadCount: 3 }]);
  const { result } = renderHook(
    () => useMessageList({ accessToken: 'token', selectedGroupId: 'a', onError: vi.fn() }),
    { wrapper },
  );
  useWorkspaceStore.getState().startPendingSend('a');
  act(() => result.current.handleVisibleLatestMessage());
  expect(mocks.advanceCursor).not.toHaveBeenCalled();
  useWorkspaceStore.getState().finishPendingSend('a');
  visible.mockReturnValue('hidden');
  act(() => result.current.handleVisibleLatestMessage());
  expect(mocks.advanceCursor).not.toHaveBeenCalled();
  visible.mockReturnValue('visible');
  await act(async () => result.current.handleVisibleLatestMessage());
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['group', 'a'] }));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(mocks.advanceCursor).toHaveBeenCalledTimes(2));
  expect(mocks.advanceCursor).toHaveBeenLastCalledWith('token', 'a', '5');
  expect(client.getQueryData<GroupResponse[]>(['groups'])?.[0]?.unreadCount).toBe(0);
});

it('keeps work-state responses and edited fields scoped to their submitted group', async () => {
  const { client, wrapper } = setup();
  let resolve: (value: unknown) => void = () => {};
  mocks.setWorkState.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  client.setQueryData(['groups'], [group('a'), group('b')]);
  client.setQueryData(['group', 'a'], group('a'));
  client.setQueryData(['group', 'b'], group('b'));
  const { result, rerender } = renderHook(
    ({ selectedGroup }) => useManagePanel(manageOptions(selectedGroup)),
    { wrapper, initialProps: { selectedGroup: group('a') } },
  );
  act(() => {
    result.current.manage.onManageStatusChange('处理中');
    result.current.manage.onManageReasonChange('review');
    result.current.manage.onManageServerChange('other');
  });
  expect(result.current.manage.workStateDirty).toBe(true);
  expect(result.current.manage.groupCategoryDirty).toBe(true);
  act(() => result.current.manage.onSaveWorkState());
  await waitFor(() =>
    expect(mocks.setWorkState).toHaveBeenCalledWith('token', 'a', {
      status: '处理中',
      reason: 'review',
    }),
  );
  rerender({ selectedGroup: group('b') });
  await act(async () =>
    resolve({
      groupId: 'a',
      status: '处理中',
      reason: 'review',
      updatedAt: '2026-10-30T01:00:00Z',
    }),
  );
  expect(client.getQueryData(['work-state', 'a'])).toMatchObject({
    groupId: 'a',
    status: '处理中',
  });
  expect(client.getQueryData(['work-state', 'b'])).toBeUndefined();
  expect(result.current.manage.manageReason).toBe('');
});

it('invalidates membership queries for the request target after navigating away', async () => {
  const { client, wrapper } = setup();
  let resolve: (value: unknown) => void = () => {};
  mocks.invite.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const options = manageOptions(group('a'));
  const { result, rerender } = renderHook(
    ({ selectedGroup }) =>
      useManagePanel({ ...options, selectedGroup, selectedGroupId: selectedGroup.id }),
    { wrapper, initialProps: { selectedGroup: group('a') } },
  );
  act(() => result.current.manage.onInviteByEmail(' member@example.test '));
  await waitFor(() =>
    expect(mocks.invite).toHaveBeenCalledWith('token', 'a', 'member@example.test'),
  );
  rerender({ selectedGroup: group('b') });
  await act(async () => resolve(group('a')));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users', 'invitable', 'a'] });
  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ['group', 'b'] });
  mocks.remove.mockResolvedValue(group('b'));
  mocks.archive.mockResolvedValue(group('b'));
  act(() => {
    result.current.manage.onRemoveMember('member');
    result.current.manage.onArchiveToggle();
  });
  await waitFor(() => expect(options.onSuccess).toHaveBeenCalledWith('成员已移出频道。'));
  expect(mocks.remove).toHaveBeenCalledWith('token', 'b', 'member');
  expect(mocks.archive).toHaveBeenCalledWith('token', 'b', true);
});

it.each(['settings', 'work-state', 'invite', 'remove', 'archive'] as const)(
  'reports %s failures and keeps the dirty form retryable',
  async (action) => {
    const { wrapper } = setup();
    const options = manageOptions(group('a'));
    for (const fn of [
      mocks.updateGroup,
      mocks.setWorkState,
      mocks.invite,
      mocks.remove,
      mocks.archive,
    ])
      fn.mockRejectedValue(new Error('request failed'));
    const { result } = renderHook(() => useManagePanel(options), { wrapper });
    act(() => result.current.manage.onManageNameChange('unsaved'));
    act(() => {
      if (action === 'settings') result.current.manage.onSaveGroup();
      if (action === 'work-state') result.current.manage.onSaveWorkState();
      if (action === 'invite') result.current.manage.onInviteByEmail('member@example.test');
      if (action === 'remove') result.current.manage.onRemoveMember('member');
      if (action === 'archive') result.current.manage.onArchiveToggle();
    });
    await waitFor(() => expect(options.onError).toHaveBeenCalledWith('request failed'));
    expect(result.current.manage.manageName).toBe('unsaved');
  },
);

it('does not submit protected changes without group management permission', () => {
  const { wrapper } = setup();
  const { result } = renderHook(
    () => useManagePanel({ ...manageOptions(group('a')), canManageGroup: false }),
    { wrapper },
  );
  act(() => {
    result.current.manage.onSaveGroup();
    result.current.manage.onSaveWorkState();
    result.current.manage.onRemoveMember('member');
    result.current.manage.onArchiveToggle();
  });
  for (const fn of [mocks.updateGroup, mocks.setWorkState, mocks.remove, mocks.archive])
    expect(fn).not.toHaveBeenCalled();
});
