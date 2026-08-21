import { useEffect, useRef } from 'react';
import { logSoundDebug, playMessageSound, playMentionSound } from '../utils/sound';
import type { MessageCreatedEvent } from './useRealtime';
import type { GroupResponse } from '../lib/groups-api';

interface UseNotificationResult {
  handleMessageCreated: (data: MessageCreatedEvent) => void;
  handleRealtimeRecovered: () => void;
}

export function useNotification(
  currentUserId: string,
  isDnd: boolean,
  groups: GroupResponse[],
  selectedGroupId: string,
  refreshConversationList: () => void,
): UseNotificationResult {
  const userIdRef = useRef(currentUserId);
  userIdRef.current = currentUserId;
  const isDndRef = useRef(isDnd);
  isDndRef.current = isDnd;
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const selectedGroupIdRef = useRef(selectedGroupId);
  selectedGroupIdRef.current = selectedGroupId;
  const unreadSnapshotRef = useRef(new Map<string, number>());
  const catchupArmedRef = useRef(false);
  const lastCatchupRefreshAtRef = useRef(0);

  const armCatchupCheck = () => {
    catchupArmedRef.current = true;
    unreadSnapshotRef.current = new Map(groupsRef.current.map((group) => [group.id, group.unreadCount ?? 0]));
    logSoundDebug('armed catch-up notification check', {
      groups: groupsRef.current.length,
      selectedGroupId: selectedGroupIdRef.current,
    });
  };

  const handlerRef = useRef((data: MessageCreatedEvent) => {
    const uid = userIdRef.current;
    const isMentioned = data.mentionedUserIds?.includes(uid);

    logSoundDebug('message.created received', {
      messageId: data.messageId,
      groupId: data.groupId,
      senderId: data.senderId,
      currentUserId: userIdRef.current,
      messageType: data.messageType,
      isMentioned,
      isDnd: isDndRef.current,
    });

    if (isDndRef.current) {
      logSoundDebug('skip sound: DnD enabled');
      return;
    }

    if (data.senderId === uid) {
      logSoundDebug('skip sound: own message');
      return;
    }

    if (isMentioned) {
      logSoundDebug('play mention sound');
      playMentionSound();
      return;
    }

    logSoundDebug('play message sound');
    playMessageSound();
  });

  useEffect(() => {
    const nextSnapshot = new Map(groups.map((group) => [group.id, group.unreadCount ?? 0]));
    if (!catchupArmedRef.current) {
      unreadSnapshotRef.current = nextSnapshot;
      return;
    }

    const hasUnreadIncrease = groups.some((group) => {
      const previousUnread = unreadSnapshotRef.current.get(group.id) ?? 0;
      const nextUnread = group.unreadCount ?? 0;
      if (nextUnread <= previousUnread) {
        return false;
      }

      return true;
    });

    logSoundDebug('catch-up notification evaluated', {
      armed: catchupArmedRef.current,
      hasUnreadIncrease,
      selectedGroupId: selectedGroupIdRef.current,
    });

    if (hasUnreadIncrease && !isDndRef.current) {
      logSoundDebug('play catch-up message sound');
      playMessageSound();
    }

    unreadSnapshotRef.current = nextSnapshot;
    catchupArmedRef.current = false;
  }, [groups]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return;
    }

    const requestCatchupRefresh = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const now = Date.now();
      if (now - lastCatchupRefreshAtRef.current < 1000) {
        return;
      }
      lastCatchupRefreshAtRef.current = now;
      armCatchupCheck();
      refreshConversationList();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestCatchupRefresh();
      }
    };

    window.addEventListener('focus', requestCatchupRefresh);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', requestCatchupRefresh);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshConversationList]);

  return {
    handleMessageCreated: handlerRef.current,
    handleRealtimeRecovered: armCatchupCheck,
  };
}
