import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseRealtimeEvent } from '@sekerchat/contracts';
import { createRealtimeUrl } from '../lib/api-core';
import type { GroupResponse, GroupMessagePreview } from '../lib/groups-api';
import type { MessageListResponse, MessageResponse } from '../lib/messages-files-api';
import { hasPendingSends } from './localMessageTracker';

const REALTIME_UNAUTHORIZED_CLOSE_CODE = 4401;
const RECENT_REALTIME_EVENT_LIMIT = 2_000;

export interface MessageCreatedEvent {
  groupId: string;
  messageId: string;
  senderId: string;
  messageType: string;
  mentionedUserIds: string[];
}

export function upsertMessageInCache(
  current: MessageListResponse | undefined,
  groupId: string,
  message: MessageResponse,
): MessageListResponse {
  if (!current) {
    return {
      groupId,
      items: [message],
    };
  }

  const existingIndex = current.items.findIndex((item) => item.id === message.id);
  if (existingIndex >= 0) {
    const items = [...current.items];
    items[existingIndex] = {
      ...message,
      clientKey: current.items[existingIndex]?.clientKey,
    };
    return {
      ...current,
      items,
    };
  }

  return {
    ...current,
    items: [...current.items, message],
  };
}

function patchGroupList(
  current: GroupResponse[] | undefined,
  groupId: string,
  patch: (group: GroupResponse) => GroupResponse,
): GroupResponse[] | undefined {
  if (!current) return current;
  return current.map((group) => (group.id === groupId ? patch(group) : group));
}

function buildLatestMessage(payload: MessageResponse | undefined): GroupMessagePreview | null {
  if (!payload || payload.type === 'system') {
    return null;
  }

  return {
    text: payload.text,
    senderId: payload.senderId,
    type: payload.type === 'text' ? 'TEXT' : payload.type === 'image' ? 'IMAGE' : 'FILE',
  };
}

function patchMessageInPages(
  current: MessageListResponse | undefined,
  groupId: string,
  message: MessageResponse,
): MessageListResponse {
  return upsertMessageInCache(current, groupId, message);
}

function patchPresenceInGroup(
  group: GroupResponse,
  payload: { userId: string; online: boolean; isDnd: boolean },
): GroupResponse {
  return {
    ...group,
    members: group.members.map((member) =>
      member.userId === payload.userId
        ? { ...member, isOnline: payload.online, isDnd: payload.online && payload.isDnd }
        : member,
    ),
  };
}

function patchReadCursorInMessages(
  current: MessageListResponse | undefined,
  payload: { userId: string; lastReadEventSequence: string },
): MessageListResponse | undefined {
  if (!current) return current;
  const cursor = BigInt(payload.lastReadEventSequence);
  return {
    ...current,
    items: current.items.map((message) => {
      if (!message.eventSequence || BigInt(message.eventSequence) > cursor || !message.readReceipt) {
        return message;
      }
      const receipt = message.readReceipt;
      const member = receipt.unreadBy.find((candidate) => candidate.userId === payload.userId);
      if (!member) return message;
      return {
        ...message,
        readReceipt: {
          ...receipt,
          readCount: receipt.readCount + 1,
          unreadCount: Math.max(0, receipt.unreadCount - 1),
          readBy: [...receipt.readBy, member],
          unreadBy: receipt.unreadBy.filter((candidate) => candidate.userId !== payload.userId),
        },
      };
    }),
  };
}

export function useRealtime(
  accessToken: string,
  selectedGroupId: string,
  currentUserId: string,
  onMessageCreated?: (data: MessageCreatedEvent) => void,
  onPresenceChanged?: (event: { userId: string; online: boolean; isDnd: boolean }) => void,
  onRecovered?: () => void,
) {
  const queryClient = useQueryClient();
  const selectedGroupRef = useRef(selectedGroupId);
  selectedGroupRef.current = selectedGroupId;
  const callbackRef = useRef(onMessageCreated);
  callbackRef.current = onMessageCreated;
  const presenceRef = useRef(onPresenceChanged);
  presenceRef.current = onPresenceChanged;
  const recoveredRef = useRef(onRecovered);
  recoveredRef.current = onRecovered;

  useEffect(() => {
    const url = createRealtimeUrl();
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let hasOpened = false;
    const loggedContractErrors = new Set<string>();
    const recentEventIds = new Set<string>();

    function markEventAsProcessed(eventId: string): boolean {
      if (recentEventIds.has(eventId)) return false;
      recentEventIds.add(eventId);
      if (recentEventIds.size > RECENT_REALTIME_EVENT_LIMIT) {
        const oldestEventId = recentEventIds.values().next().value;
        if (oldestEventId) recentEventIds.delete(oldestEventId);
      }
      return true;
    }

    function recoverFromContractError(kind: string, reason: string) {
      if (!loggedContractErrors.has(kind)) {
        loggedContractErrors.add(kind);
        console.error('[realtime] rejected event', { kind, reason });
      }
      if (selectedGroupRef.current) {
        queryClient.invalidateQueries({ queryKey: ['messages', selectedGroupRef.current] });
        queryClient.invalidateQueries({ queryKey: ['group', selectedGroupRef.current] });
        queryClient.invalidateQueries({ queryKey: ['work-state', selectedGroupRef.current] });
        queryClient.invalidateQueries({ queryKey: ['artifacts', selectedGroupRef.current] });
      }
      queryClient.invalidateQueries({ queryKey: ['groups'] });
      queryClient.invalidateQueries({ queryKey: ['dms'] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-summary'] });
    }

    function connect() {
      if (stopped) return;
      socket = new WebSocket(url);

      socket.addEventListener('open', () => {
        console.log('[realtime] connected');
        if (!hasOpened) {
          hasOpened = true;
          return;
        }

        // Backfill data missed during reconnects without duplicating initial page loads.
        if (selectedGroupRef.current) {
          queryClient.invalidateQueries({ queryKey: ['messages', selectedGroupRef.current] });
          queryClient.invalidateQueries({ queryKey: ['group', selectedGroupRef.current] });
          queryClient.invalidateQueries({ queryKey: ['work-state', selectedGroupRef.current] });
          queryClient.invalidateQueries({ queryKey: ['artifacts', selectedGroupRef.current] });
        }
        queryClient.invalidateQueries({ queryKey: ['groups'] });
        queryClient.invalidateQueries({ queryKey: ['dms'] });
        queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
        queryClient.invalidateQueries({ queryKey: ['subscription-summary'] });
        recoveredRef.current?.();
      });

      socket.addEventListener('message', (event) => {
        try {
          const parsed = parseRealtimeEvent(JSON.parse(event.data as string));
          if (!parsed.success) {
            recoverFromContractError(parsed.kind, parsed.reason);
            return;
          }
          const data = parsed.data;
          if (!markEventAsProcessed(data.eventId)) return;
          if (data.type === 'message.created.v1') {
            const messagePayload = data.payload as unknown as MessageResponse;
            const nextGroupPatch = (group: GroupResponse) => ({
              ...group,
              latestMessage: buildLatestMessage(messagePayload) ?? group.latestMessage,
              updatedAt: data.occurredAt,
              unreadCount:
                messagePayload.senderId === currentUserId ||
                selectedGroupRef.current === data.groupId
                  ? 0
                  : group.unreadCount + 1,
            });
            queryClient.setQueryData<GroupResponse[]>(['groups'], (current) =>
              patchGroupList(current, data.groupId, nextGroupPatch),
            );
            queryClient.setQueryData<GroupResponse[]>(['dms'], (current) =>
              patchGroupList(current, data.groupId, nextGroupPatch),
            );
            queryClient.setQueryData<GroupResponse>(['group', data.groupId], (current) =>
              current ? nextGroupPatch(current) : current,
            );
            queryClient.setQueryData<MessageListResponse>(['messages', data.groupId], (current) =>
              upsertMessageInCache(current, data.groupId, messagePayload),
            );
            if (messagePayload.type === 'system') {
              queryClient.invalidateQueries({ queryKey: ['artifacts', data.groupId] });
            }
            callbackRef.current?.({
              groupId: data.groupId,
              messageId: messagePayload.id,
              senderId: messagePayload.senderId,
              messageType: messagePayload.type,
              mentionedUserIds: messagePayload.mentionedUserIds,
            });
          }
          if (data.type === 'message.updated.v1') {
            queryClient.setQueryData<MessageListResponse>(['messages', data.groupId], (current) =>
              patchMessageInPages(
                current,
                data.groupId,
                data.payload as unknown as MessageResponse,
              ),
            );
          }
          if (data.type === 'message.read-cursor.changed.v1') {
            queryClient.setQueryData<MessageListResponse>(
              ['messages', data.groupId],
              (current) => patchReadCursorInMessages(current, data.payload),
            );
          }
          if (data.type === 'group.updated.v1') {
            if (data.payload?.reason === 'file_share_updated') {
              queryClient.invalidateQueries({ queryKey: ['messages', data.groupId] });
              return;
            }
            if (data.payload?.reason === 'read_receipt_updated') {
              if (data.payload?.actorUserId === currentUserId) {
                queryClient.setQueryData<GroupResponse[]>(['groups'], (current) =>
                  patchGroupList(current, data.groupId, (group) => ({
                    ...group,
                    unreadCount: 0,
                  })),
                );
                queryClient.setQueryData<GroupResponse[]>(['dms'], (current) =>
                  patchGroupList(current, data.groupId, (group) => ({
                    ...group,
                    unreadCount: 0,
                  })),
                );
                queryClient.setQueryData<GroupResponse>(['group', data.groupId], (current) =>
                  current ? { ...current, unreadCount: 0 } : current,
                );
              }
              if (!hasPendingSends(data.groupId)) {
                queryClient.invalidateQueries({ queryKey: ['messages', data.groupId] });
              }
              return;
            }
            queryClient.invalidateQueries({ queryKey: ['groups'] });
            queryClient.invalidateQueries({ queryKey: ['dms'] });
            queryClient.invalidateQueries({ queryKey: ['group', data.groupId] });
            queryClient.invalidateQueries({ queryKey: ['artifacts', data.groupId] });
          }
          if (
            data.type === 'task.created.v1' ||
            data.type === 'task.updated.v1' ||
            data.type === 'task.deleted.v1'
          ) {
            queryClient.invalidateQueries({ queryKey: ['tasks', data.groupId] });
          }
          if (data.type === 'presence.changed.v1') {
            queryClient.setQueryData<GroupResponse[]>(['groups'], (current) =>
              current?.map((group) => patchPresenceInGroup(group, data.payload)),
            );
            queryClient.setQueryData<GroupResponse[]>(['dms'], (current) =>
              current?.map((group) => patchPresenceInGroup(group, data.payload)),
            );
            if (selectedGroupRef.current) queryClient.setQueryData<GroupResponse>(
              ['group', selectedGroupRef.current],
              (current) => current ? patchPresenceInGroup(current, data.payload) : current,
            );
            presenceRef.current?.(data.payload);
          }
          if (data.type === 'subscription.changed.v1') {
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
            queryClient.invalidateQueries({ queryKey: ['subscription-summary'] });
          }
        } catch {
          recoverFromContractError('invalid_json', 'event is not valid JSON');
        }
      });

      socket.addEventListener('close', (event) => {
        if (stopped) return;
        if (event.code === REALTIME_UNAUTHORIZED_CLOSE_CODE) {
          console.error('[realtime] unauthorized, not reconnecting');
          return;
        }

        console.log(`[realtime] disconnected (code ${event.code}), reconnecting in 3s`);
        reconnectTimer = setTimeout(connect, 3000);
      });

      socket.addEventListener('error', () => {
        console.log('[realtime] error, closing');
        socket?.close();
      });
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [currentUserId, queryClient]);
}
