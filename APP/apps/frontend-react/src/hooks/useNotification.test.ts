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
  afterEach(() => {
    playMessageSound.mockReset();
    playMentionSound.mockReset();
  });

  it('skips sound when dnd is enabled', () => {
    const { result } = renderHook(() => useNotification('user-1', true, groups, 'group-1', vi.fn()));

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
    const { result } = renderHook(() => useNotification('user-1', false, groups, 'group-1', vi.fn()));

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
    const { result } = renderHook(() => useNotification('user-1', false, groups, 'group-1', vi.fn()));

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
    const { result } = renderHook(() => useNotification('user-1', false, groups, 'group-1', vi.fn()));

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
      ({ nextGroups }) => useNotification('user-1', false, nextGroups, 'group-1', refreshConversationList),
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
