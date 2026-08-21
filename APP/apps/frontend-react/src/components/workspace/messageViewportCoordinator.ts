export const LATEST_EDGE_THRESHOLD_PX = 120;
export const LOAD_OLDER_TRIGGER_TOP_PX = 160;

export type MessageViewportMode =
  | 'PinnedToBottom'
  | 'BrowsingHistory'
  | 'TopEdgeArmed'
  | 'LoadingOlder'
  | 'TopEdgeCooldown';

export interface VisibleMessageAnchor {
  messageId: string | null;
  offsetTop: number;
  scrollHeight: number;
  scrollTop: number;
}

export interface MessageListSignature {
  firstId: string;
  lastId: string;
  length: number;
  ids: string[];
}

export interface MessageListMutation {
  didChange: boolean;
  didPrepend: boolean;
  didAppend: boolean;
  didReplaceOnly: boolean;
}

export function isAtLatestEdge(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight < LATEST_EDGE_THRESHOLD_PX;
}

export function isInsideTopBand(element: HTMLElement) {
  return element.scrollTop <= LOAD_OLDER_TRIGGER_TOP_PX;
}

export function shouldReportLatestVisible(
  mode: MessageViewportMode,
  lastMessageId: string,
  lastReportedMessageId: string,
  isDocumentVisible: boolean,
): boolean {
  return (
    mode === 'PinnedToBottom'
    && Boolean(lastMessageId)
    && lastMessageId !== lastReportedMessageId
    && isDocumentVisible
  );
}

export function getRelativeTop(container: HTMLElement, target: HTMLElement) {
  return target.getBoundingClientRect().top - container.getBoundingClientRect().top;
}

export function captureVisibleMessageAnchor(container: HTMLElement): VisibleMessageAnchor {
  const containerRect = container.getBoundingClientRect();
  const messageNodes = Array.from(container.querySelectorAll<HTMLElement>('[data-message-id]'));
  const visibleNode = messageNodes.find((node) => {
    const rect = node.getBoundingClientRect();
    return rect.bottom > containerRect.top && rect.top < containerRect.bottom;
  });

  return {
    messageId: visibleNode?.dataset.messageId ?? null,
    offsetTop: visibleNode ? getRelativeTop(container, visibleNode) : 0,
    scrollHeight: container.scrollHeight,
    scrollTop: container.scrollTop,
  };
}

export function restoreVisibleMessageAnchor(container: HTMLElement, anchor: VisibleMessageAnchor) {
  const anchorNode = anchor.messageId
    ? container.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(anchor.messageId)}"]`)
    : null;

  if (anchorNode) {
    const delta = getRelativeTop(container, anchorNode) - anchor.offsetTop;
    if (Math.abs(delta) >= 0.5) {
      container.scrollTop += delta;
      return true;
    }
    return false;
  }

  const delta = container.scrollHeight - anchor.scrollHeight;
  if (Math.abs(delta) >= 0.5) {
    container.scrollTop = anchor.scrollTop + delta;
    return true;
  }

  return false;
}

export function createMessageListSignature(ids: string[]): MessageListSignature {
  return {
    firstId: ids[0] ?? '',
    lastId: ids.at(-1) ?? '',
    length: ids.length,
    ids,
  };
}

export function classifyMessageListMutation(
  previous: MessageListSignature,
  current: MessageListSignature,
): MessageListMutation {
  const didChange =
    previous.length !== current.length
    || previous.firstId !== current.firstId
    || previous.lastId !== current.lastId
    || previous.ids.some((id, index) => current.ids[index] !== id);

  const didPrepend =
    previous.length > 0
    && current.length > previous.length
    && current.ids.slice(current.length - previous.length).every((id, index) => id === previous.ids[index]);

  const didAppend =
    previous.length > 0
    && current.length > previous.length
    && current.ids.slice(0, previous.length).every((id, index) => id === previous.ids[index]);

  return {
    didAppend,
    didChange,
    didPrepend,
    didReplaceOnly: didChange && previous.length === current.length,
  };
}

export function modeAfterUserScroll(
  mode: MessageViewportMode,
  element: HTMLElement,
  hasMoreOlderMessages: boolean,
) {
  if (mode === 'LoadingOlder') {
    return mode;
  }

  if (mode === 'TopEdgeCooldown') {
    return isInsideTopBand(element) ? mode : 'BrowsingHistory';
  }

  if (hasMoreOlderMessages && isInsideTopBand(element)) {
    return 'TopEdgeArmed' satisfies MessageViewportMode;
  }

  if (isAtLatestEdge(element)) {
    return 'PinnedToBottom' satisfies MessageViewportMode;
  }

  if (!hasMoreOlderMessages) {
    return 'BrowsingHistory' satisfies MessageViewportMode;
  }

  return 'BrowsingHistory' satisfies MessageViewportMode;
}
