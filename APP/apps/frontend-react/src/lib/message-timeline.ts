import type { MessageListResponse, MessageResponse } from './messages-files-api';

/** A local send may exist before the first authoritative HTTP page has loaded. */
export interface MessageTimeline extends MessageListResponse {
  isPartial?: true;
  /** Last HTTP-covered message; live events cannot advance the recovery boundary. */
  latestReadMessageId?: string;
}

function isLocal(message: MessageResponse): boolean {
  return Boolean(message.isSending || message.sendError);
}

function compareMessages(left: MessageResponse, right: MessageResponse): number {
  if (isLocal(left) || isLocal(right)) return Number(isLocal(left)) - Number(isLocal(right));
  if (left.eventSequence && right.eventSequence) {
    const a = BigInt(left.eventSequence);
    const b = BigInt(right.eventSequence);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return Date.parse(left.createdAt) - Date.parse(right.createdAt);
}

function mergeItems(current: MessageResponse[], incoming: MessageResponse[]): MessageResponse[] {
  const items = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const existing = items.get(message.id);
    // A delayed HTTP read must not undo a newer realtime edit/revocation.
    const existingRevision = existing?.revokedAt ?? existing?.editedAt ?? '';
    const incomingRevision = message.revokedAt ?? message.editedAt ?? '';
    const next = existingRevision > incomingRevision ? existing! : message;
    items.set(message.id, existing?.clientKey ? { ...next, clientKey: existing.clientKey } : next);
  }
  return [...items.values()].sort(compareMessages);
}

export function mergeLatestMessagePage(
  current: MessageTimeline | undefined,
  page: MessageListResponse,
): MessageTimeline {
  const snapshot = { ...page, latestReadMessageId: page.items.at(-1)?.id };
  if (!current || current.groupId !== page.groupId) return snapshot;
  const items = mergeItems(current.items, page.items);
  const oldestLoaded = current.items.find((message) => !isLocal(message));
  const retainsOldestBoundary =
    !current.isPartial && oldestLoaded && items[0]?.id === oldestLoaded.id;
  return {
    ...snapshot,
    items,
    nextCursor: retainsOldestBoundary ? current.nextCursor : page.nextCursor,
  };
}

export function mergeOlderMessagePage(
  current: MessageTimeline | undefined,
  page: MessageListResponse,
): MessageTimeline {
  if (!current || current.groupId !== page.groupId) return page;
  // Existing records can have newer realtime edits than this historical page.
  return { ...current, items: mergeItems(page.items, current.items), nextCursor: page.nextCursor };
}

export function receiveCreatedMessage(
  current: MessageTimeline | undefined,
  groupId: string,
  message: MessageResponse,
): MessageTimeline | undefined {
  // An event is not an initial page: it carries neither history nor a cursor.
  if (!current || current.groupId !== groupId || message.groupId !== groupId) return current;
  return { ...current, items: mergeItems(current.items, [message]) };
}

export function patchTimelineMessage(
  current: MessageTimeline | undefined,
  groupId: string,
  message: MessageResponse,
): MessageTimeline | undefined {
  if (
    !current ||
    current.groupId !== groupId ||
    !current.items.some((item) => item.id === message.id)
  )
    return current;
  return receiveCreatedMessage(current, groupId, message);
}

export function confirmTimelineMessage(
  current: MessageTimeline | undefined,
  groupId: string,
  localId: string,
  message: MessageResponse,
): MessageTimeline {
  const optimistic = current?.items.find((item) => item.id === localId);
  const remaining =
    current?.items.filter((item) => item.id !== localId && item.id !== message.id) ?? [];
  return {
    ...(current ?? { groupId, isPartial: true as const }),
    items: mergeItems(remaining, [{ ...message, clientKey: optimistic?.clientKey ?? localId }]),
  };
}

/** Read latest, bridge any offline gap, then merge with the cache as it is now. */
export async function refreshMessageTimeline(
  fetchPage: (cursor?: string) => Promise<MessageListResponse>,
  getCurrent: () => MessageTimeline | undefined,
): Promise<MessageTimeline> {
  const previous = getCurrent();
  const boundary = previous?.latestReadMessageId;
  const knownIds = new Set(
    boundary
      ? [boundary]
      : previous?.items.filter((message) => !isLocal(message)).map((message) => message.id),
  );
  let page = await fetchPage();
  const groupId = page.groupId;
  let items = page.items;
  const cursors = new Set<string>();
  while (
    knownIds.size &&
    page.nextCursor &&
    !page.items.some((message) => knownIds.has(message.id))
  ) {
    if (cursors.has(page.nextCursor)) throw new Error('消息分页游标重复，请重试。');
    cursors.add(page.nextCursor);
    page = await fetchPage(page.nextCursor);
    if (page.groupId !== groupId) throw new Error('消息分页所属频道不一致，请重试。');
    items = mergeItems(page.items, items);
  }
  return mergeLatestMessagePage(getCurrent(), { groupId, items, nextCursor: page.nextCursor });
}
