import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  listMessages,
  type MessageListResponse,
  type MessageResponse,
} from '../../lib/messages-files-api';
import { advanceReadCursor } from '../../lib/groups-api';
import type { GroupResponse } from '../../lib/groups-api';
import { hasPendingSends } from '../../hooks/localMessageTracker';
import { ReadCursorCoordinator } from './readCursorCoordinator';

interface UseMessageListInput {
  accessToken: string;
  selectedGroupId: string;
  initialMessages?: MessageListResponse | null;
  initialMessagesUpdatedAt?: number;
  onError: (text: string) => void;
}

interface UseMessageListOutput {
  messagesQuery: UseQueryResult<MessageListResponse>;
  messages: MessageResponse[];
  olderMessagesCursor: string | null;
  isLoadingOlderMessages: boolean;
  loadOlderMessages: () => Promise<void>;
  patchLoadedMessage: (updatedMessage: MessageResponse) => void;
  handleVisibleLatestMessage: () => void;
}

export function useMessageList({
  accessToken,
  selectedGroupId,
  initialMessages,
  initialMessagesUpdatedAt,
  onError,
}: UseMessageListInput): UseMessageListOutput {
  const queryClient = useQueryClient();
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const accessTokenRef = useRef(accessToken);
  accessTokenRef.current = accessToken;
  const readCursorCoordinatorRef = useRef<ReadCursorCoordinator | null>(null);
  if (!readCursorCoordinatorRef.current) {
    readCursorCoordinatorRef.current = new ReadCursorCoordinator(
      (groupId, eventSequence) => advanceReadCursor(accessTokenRef.current, groupId, eventSequence),
      (error, groupId) => {
        console.error('advanceReadCursor failed:', error);
        void queryClient.invalidateQueries({ queryKey: ['groups'] });
        void queryClient.invalidateQueries({ queryKey: ['dms'] });
        void queryClient.invalidateQueries({ queryKey: ['group', groupId] });
      },
    );
  }

  const messagesQuery = useQuery({
    queryKey: ['messages', selectedGroupId],
    queryFn: () => listMessages(accessToken, selectedGroupId, { limit: 50 }),
    enabled: Boolean(selectedGroupId),
    staleTime: 10 * 1000,
    initialData: initialMessages?.groupId === selectedGroupId ? initialMessages : undefined,
    initialDataUpdatedAt:
      initialMessages?.groupId === selectedGroupId ? initialMessagesUpdatedAt : undefined,
  });

  const messages = messagesQuery.data?.items ?? [];
  const olderMessagesCursor =
    messagesQuery.data?.groupId === selectedGroupId
      ? (messagesQuery.data?.nextCursor ?? null)
      : null;

  useEffect(() => {
    setIsLoadingOlderMessages(false);
  }, [selectedGroupId]);

  const markSelectedGroupRead = useCallback(() => {
    if (hasPendingSends(selectedGroupId) || !selectedGroupId) return;

    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const latest = messages.at(-1);
    if (!latest?.eventSequence) return;

    readCursorCoordinatorRef.current?.observe(selectedGroupId, latest.eventSequence);
    queryClient.setQueryData<GroupResponse[]>(['groups'], (current) =>
      current?.map((group) =>
        group.id === selectedGroupId ? { ...group, unreadCount: 0 } : group,
      ),
    );
    queryClient.setQueryData<GroupResponse[]>(['dms'], (current) =>
      current?.map((group) =>
        group.id === selectedGroupId ? { ...group, unreadCount: 0 } : group,
      ),
    );
    queryClient.setQueryData<GroupResponse>(['group', selectedGroupId], (current) =>
      current ? { ...current, unreadCount: 0 } : current,
    );
  }, [messages, queryClient, selectedGroupId]);

  const patchLoadedMessage = useCallback(
    (updatedMessage: MessageResponse) => {
      queryClient.setQueryData<MessageListResponse>(['messages', selectedGroupId], (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) =>
            item.id === updatedMessage.id ? { ...updatedMessage, clientKey: item.clientKey } : item,
          ),
        };
      });
    },
    [queryClient, selectedGroupId],
  );

  const loadOlderMessages = useCallback(async () => {
    if (!selectedGroupId || !olderMessagesCursor || isLoadingOlderMessages) return;

    setIsLoadingOlderMessages(true);
    try {
      const olderPage = await listMessages(accessToken, selectedGroupId, {
        cursor: olderMessagesCursor,
        limit: 50,
      });

      queryClient.setQueryData<MessageListResponse>(['messages', selectedGroupId], (current) => {
        if (!current) return olderPage;

        const existingIds = new Set(current.items.map((item) => item.id));
        const mergedOlderItems = olderPage.items.filter((item) => !existingIds.has(item.id));
        return {
          ...current,
          items: [...mergedOlderItems, ...current.items],
          nextCursor: olderPage.nextCursor ?? null,
        };
      });
    } catch (error) {
      console.error('loadOlderMessages failed:', error);
      onError(error instanceof Error ? error.message : '加载更早消息失败。');
    } finally {
      setIsLoadingOlderMessages(false);
    }
  }, [accessToken, isLoadingOlderMessages, olderMessagesCursor, queryClient, selectedGroupId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const handleVisibilityOrFocus = () => {
      markSelectedGroupRead();
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [markSelectedGroupRead]);

  const handleVisibleLatestMessage = useCallback(() => {
    markSelectedGroupRead();
  }, [markSelectedGroupRead]);

  return {
    messagesQuery,
    messages,
    olderMessagesCursor,
    isLoadingOlderMessages,
    loadOlderMessages,
    patchLoadedMessage,
    handleVisibleLatestMessage,
  };
}
