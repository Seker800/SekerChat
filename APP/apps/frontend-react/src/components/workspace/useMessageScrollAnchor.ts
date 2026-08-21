import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { MessageResponse } from '../../lib/messages-files-api';
import {
  captureVisibleMessageAnchor,
  classifyMessageListMutation,
  createMessageListSignature,
  isAtLatestEdge,
  isInsideTopBand,
  modeAfterUserScroll,
  restoreVisibleMessageAnchor,
  shouldReportLatestVisible,
  type MessageListSignature,
  type MessageViewportMode,
  type VisibleMessageAnchor,
} from './messageViewportCoordinator';

interface UseMessageScrollAnchorOptions {
  activeGroupId: string;
  currentUserId: string;
  hasMoreOlderMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  messages: MessageResponse[];
  onLoadOlderMessages?: () => void | Promise<void>;
  onVisibleLatestMessage?: () => void;
}

type ScrollWriteReason = 'latest-edge' | 'older-anchor';

function signatureFromMessages(messages: MessageResponse[]) {
  return createMessageListSignature(messages.map((message) => message.id));
}

export function useMessageScrollAnchor({
  activeGroupId,
  currentUserId,
  hasMoreOlderMessages,
  isLoadingOlderMessages,
  messages,
  onLoadOlderMessages,
  onVisibleLatestMessage,
}: UseMessageScrollAnchorOptions) {
  const streamRef = useRef<HTMLElement | null>(null);
  const modeRef = useRef<MessageViewportMode>('PinnedToBottom');
  const lastGroupIdRef = useRef(activeGroupId);
  const lastVisibleMessageIdRef = useRef('');
  const olderLoadAnchorRef = useRef<VisibleMessageAnchor | null>(null);
  const previousSignatureRef = useRef<MessageListSignature>(signatureFromMessages(messages));
  const hasScrolledInitialViewRef = useRef(false);
  const latestScrollWriteRef = useRef<{ reason: ScrollWriteReason } | null>(null);
  const loadRequestIdRef = useRef(0);
  const loadRequestSettledRef = useRef(false);
  const lastMessage = messages.at(-1) ?? null;
  const lastMessageId = lastMessage?.id ?? '';
  const isLocalSendingMessage =
    lastMessage?.senderId === currentUserId && Boolean(lastMessage.isSending);

  const markProgrammaticScroll = useCallback((reason: ScrollWriteReason) => {
    latestScrollWriteRef.current = { reason };
    window.requestAnimationFrame(() => {
      if (latestScrollWriteRef.current?.reason === reason) {
        latestScrollWriteRef.current = null;
      }
    });
  }, []);

  const writeScrollTop = useCallback((element: HTMLElement, value: number, reason: ScrollWriteReason) => {
    markProgrammaticScroll(reason);
    element.scrollTop = value;
  }, [markProgrammaticScroll]);

  const scrollStreamToBottom = useCallback((force = false) => {
    const element = streamRef.current;

    if (!element) {
      return;
    }

    if (!force && modeRef.current !== 'PinnedToBottom') {
      return;
    }

    window.requestAnimationFrame(() => {
      writeScrollTop(element, element.scrollHeight, 'latest-edge');
      modeRef.current = 'PinnedToBottom';
    });
  }, [writeScrollTop]);

  const settleOlderLoad = useCallback(() => {
    olderLoadAnchorRef.current = null;
    loadRequestSettledRef.current = false;
    if (modeRef.current === 'LoadingOlder') {
      modeRef.current = 'TopEdgeCooldown';
    }
  }, []);

  const restoreOlderAnchor = useCallback((allowScrollHeightFallback = true) => {
    const element = streamRef.current;
    const anchor = olderLoadAnchorRef.current;
    if (!element || !anchor || modeRef.current !== 'LoadingOlder') {
      return false;
    }

    const anchorNode = anchor.messageId
      ? element.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(anchor.messageId)}"]`)
      : null;
    if (!anchorNode && !allowScrollHeightFallback) {
      return false;
    }

    markProgrammaticScroll('older-anchor');
    restoreVisibleMessageAnchor(element, anchor);
    return true;
  }, [markProgrammaticScroll]);

  const startOlderLoad = useCallback(() => {
    const element = streamRef.current;
    if (!element || !hasMoreOlderMessages || modeRef.current !== 'TopEdgeArmed') {
      return;
    }

    modeRef.current = 'LoadingOlder';
    olderLoadAnchorRef.current = captureVisibleMessageAnchor(element);
    loadRequestSettledRef.current = false;
    const requestId = ++loadRequestIdRef.current;

    Promise.resolve(onLoadOlderMessages?.()).finally(() => {
      if (loadRequestIdRef.current !== requestId) {
        return;
      }

      loadRequestSettledRef.current = true;
      window.requestAnimationFrame(() => {
        if (loadRequestIdRef.current !== requestId || modeRef.current !== 'LoadingOlder') {
          return;
        }
        restoreOlderAnchor();
        settleOlderLoad();
      });
    });
  }, [hasMoreOlderMessages, onLoadOlderMessages, restoreOlderAnchor, settleOlderLoad]);

  const handleScroll = useCallback(() => {
    const element = streamRef.current;
    if (!element) {
      return;
    }

    const programmaticWrite = latestScrollWriteRef.current;
    if (programmaticWrite) {
      if (modeRef.current === 'PinnedToBottom' && !isAtLatestEdge(element)) {
        modeRef.current = 'BrowsingHistory';
      }
      return;
    }

    modeRef.current = modeAfterUserScroll(modeRef.current, element, Boolean(hasMoreOlderMessages));

    if (modeRef.current === 'TopEdgeArmed' && isInsideTopBand(element)) {
      startOlderLoad();
    }
  }, [hasMoreOlderMessages, startOlderLoad]);

  const handleContentResized = useCallback(() => {
    const element = streamRef.current;
    if (!element) {
      return;
    }

    if (modeRef.current === 'PinnedToBottom') {
      scrollStreamToBottom();
      return;
    }

    if (modeRef.current === 'LoadingOlder') {
      restoreOlderAnchor();
    }
  }, [restoreOlderAnchor, scrollStreamToBottom]);

  useEffect(() => {
    modeRef.current = 'PinnedToBottom';
    olderLoadAnchorRef.current = null;
    loadRequestSettledRef.current = false;
  }, [activeGroupId]);

  useLayoutEffect(() => {
    const element = streamRef.current;
    if (!element) {
      return;
    }

    const previousSignature = previousSignatureRef.current;
    const currentSignature = signatureFromMessages(messages);
    previousSignatureRef.current = currentSignature;
    const mutation = classifyMessageListMutation(previousSignature, currentSignature);

    if (lastGroupIdRef.current !== activeGroupId) {
      lastGroupIdRef.current = activeGroupId;
      modeRef.current = 'PinnedToBottom';
      hasScrolledInitialViewRef.current = false;
    }

    if (!hasScrolledInitialViewRef.current) {
      hasScrolledInitialViewRef.current = true;
      scrollStreamToBottom(true);
      return;
    }

    if (modeRef.current === 'LoadingOlder') {
      if (mutation.didPrepend || loadRequestSettledRef.current || !isLoadingOlderMessages) {
        restoreOlderAnchor(mutation.didPrepend || loadRequestSettledRef.current || !isLoadingOlderMessages);
        if (loadRequestSettledRef.current || !isLoadingOlderMessages) {
          settleOlderLoad();
        }
      }
      return;
    }

    if (!isLocalSendingMessage && !mutation.didChange) {
      return;
    }

    if (mutation.didReplaceOnly && !isLocalSendingMessage) {
      return;
    }

    if (modeRef.current !== 'PinnedToBottom') {
      return;
    }

    scrollStreamToBottom();
  }, [
    activeGroupId,
    isLoadingOlderMessages,
    isLocalSendingMessage,
    lastMessageId,
    messages,
    scrollStreamToBottom,
    restoreOlderAnchor,
    settleOlderLoad,
  ]);

  useLayoutEffect(() => {
    const element = streamRef.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver(() => {
      handleContentResized();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [activeGroupId, handleContentResized]);

  useEffect(() => {
    if (!lastMessageId) {
      lastVisibleMessageIdRef.current = '';
      return;
    }

    if (!shouldReportLatestVisible(
      modeRef.current,
      lastMessageId,
      lastVisibleMessageIdRef.current,
      typeof document === 'undefined' || document.visibilityState === 'visible',
    )) {
      return;
    }

    lastVisibleMessageIdRef.current = lastMessageId;
    onVisibleLatestMessage?.();
  }, [lastMessageId, onVisibleLatestMessage]);

  return {
    handleContentResized,
    handleScroll,
    scrollToLatestEdge: scrollStreamToBottom,
    streamRef,
  };
}
