import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNotification } from './useNotification';
import type { GroupResponse } from '../lib/groups-api';

const playMessageSound = vi.fn();
const playMentionSound = vi.fn();

vi.mock('../utils/sound', () => ({
  logSoundDebug: () => {},
  playMessageSound: () => playMessageSound(),
  playMentionSound: () => playMentionSound(),
}));

const groups: GroupResponse[] = [
  {
    id: 'group-1',
    name: 'General',
    category: '研发',
    serverId: null,
    server: null,
    isDM: false,
    latestMessage: null,
    serverAvatarUrl: null,
    workState: null,
    artifactConfirmation: {
      isConfirmed: false,
      confirmedAt: null,
      confirmedByUserId: null,
      confirmedByDisplayName: null,
    },
    archivedAt: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    createdById: 'user-1',
    currentUserRole: 'ADMIN',
    unreadCount: 0,
    memberCount: 1,
    members: [],
  },
];

describe('useNotification', () => {
  it('muting suppresses ordinary and mention sounds, and unmuting immediately restores sound', () => {
    const { result, rerender } = renderHook(
      ({ muted }) =>
        useNotification(
          'user-1',
          false,
          [{ ...groups[0], notificationsMuted: muted }],
          'group-1',
          vi.fn(),
        ),
      { initialProps: { muted: true } },
    );
    const message = {
      groupId: 'group-1',
      messageId: 'm',
      senderId: 'user-2',
      messageType: 'text',
      mentionedUserIds: ['user-1'],
    };
    result.current.handleMessageCreated(message);
    result.current.handleMessageCreated({ ...message, mentionedUserIds: [] });
    expect(playMessageSound).not.toHaveBeenCalled();
    expect(playMentionSound).not.toHaveBeenCalled();
    rerender({ muted: false });
    result.current.handleMessageCreated(message);
    expect(playMentionSound).toHaveBeenCalledTimes(1);
  });

  it('catch-up ignores muted groups while preserving notifications for other groups', () => {
    const initial = [
      { ...groups[0], notificationsMuted: true },
      { ...groups[0], id: 'other', notificationsMuted: false },
    ];
    const { result, rerender } = renderHook(
      ({ nextGroups }) => useNotification('user-1', false, nextGroups, '', vi.fn()),
      { initialProps: { nextGroups: initial } },
    );
    act(() => result.current.handleRealtimeRecovered());
    rerender({ nextGroups: [{ ...initial[0], unreadCount: 4 }, initial[1]] });
    expect(playMessageSound).not.toHaveBeenCalled();
    act(() => result.current.handleRealtimeRecovered());
    rerender({
      nextGroups: [
        { ...initial[0], unreadCount: 5 },
        { ...initial[1], unreadCount: 1 },
      ],
    });
    expect(playMessageSound).toHaveBeenCalledTimes(1);
    result.current.handleMessageCreated({
      groupId: 'other',
      messageId: 'm',
      senderId: 'user-2',
      messageType: 'text',
      mentionedUserIds: [],
    });
    expect(playMessageSound).toHaveBeenCalledTimes(2);
  });
  afterEach(() => {
    playMessageSound.mockReset();
    playMentionSound.mockReset();
  });

  it('skips sound when dnd is enabled', () => {
    const { result } = renderHook(() =>
      useNotification('user-1', true, groups, 'group-1', vi.fn()),
    );

    result.current.handleMessageCreated({
      groupId: 'group-1',
      messageId: 'message-1',
      senderId: 'user-2',
      messageType: 'text',
      mentionedUserIds: [],
    });

    expect(playMessageSound).not.toHaveBeenCalled();
    expect(playMentionSound).not.toHaveBeenCalled();
  });

  it('skips sound for own messages', () => {
    const { result } = renderHook(() =>
      useNotification('user-1', false, groups, 'group-1', vi.fn()),
    );

    result.current.handleMessageCreated({
      groupId: 'group-1',
      messageId: 'message-1',
      senderId: 'user-1',
      messageType: 'text',
      mentionedUserIds: ['user-1'],
    });

    expect(playMessageSound).not.toHaveBeenCalled();
    expect(playMentionSound).not.toHaveBeenCalled();
  });

  it('plays mention sound for mentions from other users', () => {
    const { result } = renderHook(() =>
      useNotification('user-1', false, groups, 'group-1', vi.fn()),
    );

    result.current.handleMessageCreated({
      groupId: 'group-1',
      messageId: 'message-1',
      senderId: 'user-2',
      messageType: 'text',
      mentionedUserIds: ['user-1'],
    });

    expect(playMentionSound).toHaveBeenCalledTimes(1);
    expect(playMessageSound).not.toHaveBeenCalled();
  });

  it('plays regular message sound for ordinary incoming messages', () => {
    const { result } = renderHook(() =>
      useNotification('user-1', false, groups, 'group-1', vi.fn()),
    );

    result.current.handleMessageCreated({
      groupId: 'group-1',
      messageId: 'message-1',
      senderId: 'user-2',
      messageType: 'text',
      mentionedUserIds: [],
    });

    expect(playMessageSound).toHaveBeenCalledTimes(1);
    expect(playMentionSound).not.toHaveBeenCalled();
  });

  it('plays a catch-up sound when unread count increases after reconnect', () => {
    const refreshConversationList = vi.fn();
    const { result, rerender } = renderHook(
      ({ nextGroups }) =>
        useNotification('user-1', false, nextGroups, 'group-1', refreshConversationList),
      {
        initialProps: {
          nextGroups: groups,
        },
      },
    );

    act(() => {
      result.current.handleRealtimeRecovered();
    });

    rerender({
      nextGroups: [
        {
          ...groups[0],
          unreadCount: 1,
        },
      ],
    });

    expect(playMessageSound).toHaveBeenCalledTimes(1);
    expect(playMentionSound).not.toHaveBeenCalled();
  });

  it('skips catch-up sound when unread count does not increase', () => {
    const { result, rerender } = renderHook(
      ({ nextGroups }) => useNotification('user-1', false, nextGroups, 'group-1', vi.fn()),
      {
        initialProps: {
          nextGroups: [
            {
              ...groups[0],
              unreadCount: 1,
            },
          ],
        },
      },
    );

    act(() => {
      result.current.handleRealtimeRecovered();
    });

    rerender({
      nextGroups: [
        {
          ...groups[0],
          unreadCount: 1,
        },
      ],
    });

    expect(playMessageSound).not.toHaveBeenCalled();
    expect(playMentionSound).not.toHaveBeenCalled();
  });
});
