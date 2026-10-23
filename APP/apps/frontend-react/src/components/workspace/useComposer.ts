import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatAttachmentMbToBytes, DEFAULT_CHAT_ATTACHMENT_MAX_MB } from '@sekerchat/shared';
import { createStore } from 'zustand/vanilla';
import { useWorkspaceStore } from '../../store/workspace-store';
import {
  createMessage,
  type MessageResponse,
} from '../../lib/messages-files-api';
import type { SessionUser } from '../../lib/auth-api';
import type { SystemConfig } from '../../lib/system-config-api';
import { trackLocallySentMessage, trackSendingEnd, trackSendingStart } from '../../hooks/localMessageTracker';
import { uploadFileViaMultipart, type MultipartUploadProgress as UploadProgress } from '../../lib/multipart-upload';
import { createClientMessageId } from '../../lib/client-message-id';
import { useClipboardBatch } from './useClipboardBatch';
import type { ClipboardPart } from './clipboard-content';

interface UseComposerOptions {
  accessToken: string;
  selectedGroupId: string;
  messages: MessageResponse[];
  channelName: string;
  currentUser: Pick<SessionUser, 'id' | 'email' | 'displayName' | 'avatarUrl'>;
  onError: (message: string) => void;
  refetchMessages: () => void;
  groupMembers?: Array<{ userId: string; displayName: string | null; email: string }>;
  chatAttachmentMaxMB?: SystemConfig['chatAttachmentMaxMB'];
}

export interface MentionSuggestion {
  userId: string;
  displayName: string;
  email: string;
}

type PendingStatus = 'uploading' | 'creating-message' | 'error';

export interface PendingUpload {
  localId: string;
  fileName: string;
  file?: File;
  replyToMessageId?: string;
  progress: UploadProgress;
  status: PendingStatus;
  error?: string;
  uploadedFile?: { id: string; kindLabel: string };
}

function getReplyTarget(messages: MessageResponse[], replyToMessageId: string): MessageResponse | null {
  if (!replyToMessageId) return null;
  return messages.find((item) => item.id === replyToMessageId) ?? null;
}

export function useComposer({
  accessToken,
  selectedGroupId,
  messages,
  channelName,
  currentUser,
  onError,
  refetchMessages,
  groupMembers,
  chatAttachmentMaxMB,
}: UseComposerOptions) {
  const queryClient = useQueryClient();
  const [draftStore] = useState(() => createStore<{ text: string }>(() => ({ text: '' })));
  const setDraft = useCallback((value: string | ((current: string) => string)) => {
    draftStore.setState(({ text }) => ({ text: typeof value === 'function' ? value(text) : value }));
  }, [draftStore]);
  const [pendingUploadsByGroupId, setPendingUploadsByGroupId] = useState<Record<string, PendingUpload[]>>({});
  const { composerSeedText, replyToMessageId, setComposerSeedText, setReplyToMessageId } = useWorkspaceStore();
  const mounted = useRef(true);
  const activeUploads = useRef(new Map<string, AbortController>());
  useEffect(() => {
    mounted.current = true;
    return () => {
    mounted.current = false;
    for (const controller of activeUploads.current.values()) controller.abort();
    activeUploads.current.clear();
    };
  }, []);
  const pendingUploads = selectedGroupId ? (pendingUploadsByGroupId[selectedGroupId] ?? []) : [];
  const chatAttachmentMaxBytes = chatAttachmentMbToBytes(chatAttachmentMaxMB ?? DEFAULT_CHAT_ATTACHMENT_MAX_MB);

  const clipboardBatch = useClipboardBatch({
    accessToken,
    groupId: selectedGroupId,
    maxBytes: chatAttachmentMaxBytes,
    replyToMessageId,
    onMessage: (message, groupId) => {
      trackLocallySentMessage(message.id);
      queryClient.setQueryData<{ groupId: string; items: MessageResponse[] }>(
        ['messages', groupId],
        (current) => ({ groupId, items: [...(current?.items ?? []).filter((item) => item.id !== message.id), message] }),
      );
      void queryClient.invalidateQueries({ queryKey: ['messages', groupId] });
    },
  });

  const updatePendingUploadsForGroup = useCallback(
    (groupId: string, updater: (current: PendingUpload[]) => PendingUpload[]) => {
      if (!groupId) return;
      setPendingUploadsByGroupId((prev) => {
        const nextItems = updater(prev[groupId] ?? []);
        if (nextItems.length === 0) {
          const { [groupId]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [groupId]: nextItems };
      });
    },
    [],
  );

  useEffect(() => {
    if (!composerSeedText) {
      return;
    }

    setDraft((current) => {
      const normalizedCurrent = current.trim();
      return normalizedCurrent ? `${normalizedCurrent} ${composerSeedText}` : composerSeedText;
    });
    setComposerSeedText('');
  }, [composerSeedText, setComposerSeedText, setDraft]);

  const sendMessageMutation = useMutation({
    scope: { id: `text-message:${selectedGroupId || 'none'}` },
    mutationFn: async ({ targetGroupId, text, localId, savedReplyToId }: { targetGroupId: string; text: string; localId: string; savedReplyToId?: string }) => {
      if (!targetGroupId || !text.trim()) {
        return null;
      }

      const message = await createMessage(accessToken, targetGroupId, {
        type: 'text',
        clientMessageId: localId,
        text,
        replyToMessageId: savedReplyToId || undefined,
      });

      return { localId, message };
    },
    onSuccess(result, variables) {
      trackSendingEnd(variables.targetGroupId);
      if (result?.message?.id) trackLocallySentMessage(result.message.id);
      if (result?.message) {
        queryClient.setQueryData<{ groupId: string; items: MessageResponse[] }>(
          ['messages', variables.targetGroupId],
          (current) => {
            if (!current) {
              return { groupId: variables.targetGroupId, items: [result.message] };
            }

            const optimisticIndex = current.items.findIndex((item) => item.id === variables.localId);
            if (optimisticIndex >= 0) {
              const items = current.items.filter((item) => item.id !== result.message.id);
              items[optimisticIndex] = { ...result.message, clientKey: variables.localId };
              return { ...current, items };
            }

            const confirmedIndex = current.items.findIndex((item) => item.id === result.message.id);
            if (confirmedIndex >= 0) {
              const items = [...current.items];
              items[confirmedIndex] = result.message;
              return { ...current, items };
            }

            return { ...current, items: [...current.items, result.message] };
          },
        );
      } else {
        refetchMessages();
      }
    },
    onError(error, variables) {
      trackSendingEnd(variables.targetGroupId);
      const message = error instanceof Error ? error.message : '发送消息失败。';

      // Mark the optimistic message as failed in cache so the user sees a retry option.
      queryClient.setQueryData<{ groupId: string; items: MessageResponse[] }>(
        ['messages', variables.targetGroupId],
        (current) => {
          if (!current) return current;
          return {
            ...current,
            items: current.items.map((item) =>
              item.id === variables.localId
                ? { ...item, isSending: false, sendError: message }
                : item,
            ),
          };
        },
      );

      onError(message);
    },
  });

  const sendDraft = useCallback(() => {
    const text = draftStore.getState().text.trim();
    if (!selectedGroupId || !text) {
      return;
    }

    const targetGroupId = selectedGroupId;
    const localId = createClientMessageId();
    const savedReplyToId = replyToMessageId;
    const replyTarget = savedReplyToId ? messages.find((m) => m.id === savedReplyToId) : null;

    const optimisticMessage: MessageResponse = {
      id: localId,
      clientKey: localId,
      groupId: targetGroupId,
      senderId: currentUser.id,
      type: 'text',
      text,
      revokedAt: null,
      editedAt: null,
      mentionedUserIds: [],
      replyTo: replyTarget
        ? {
            id: replyTarget.id,
            senderId: replyTarget.senderId,
            type: replyTarget.type,
            textPreview: replyTarget.text,
            sender: replyTarget.sender,
            attachment: replyTarget.attachment,
          }
        : null,
      attachment: null,
      readReceipt: null,
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUser.id,
        email: currentUser.email,
        displayName: currentUser.displayName,
        avatarUrl: currentUser.avatarUrl,
      },
      isSending: true,
    };

    // Insert optimistic message into cache so it appears inline immediately.
    queryClient.setQueryData<{ groupId: string; items: MessageResponse[] }>(
      ['messages', selectedGroupId],
      (current) => {
        if (!current) {
          return { groupId: selectedGroupId, items: [optimisticMessage] };
        }
        return {
          ...current,
          items: [...current.items, optimisticMessage],
        };
      },
    );

    setDraft('');
    setComposerSeedText('');
    setReplyToMessageId('');
    trackSendingStart(targetGroupId);
    void sendMessageMutation
      .mutateAsync({ targetGroupId, text, localId, savedReplyToId })
      .catch(() => undefined);
  }, [draftStore, setDraft, selectedGroupId, messages, currentUser, queryClient, sendMessageMutation, setComposerSeedText, setReplyToMessageId]);

  const runUploadEntry = useCallback(async (targetGroupId: string, entry: PendingUpload) => {
    if (!mounted.current || !entry.file || activeUploads.current.has(entry.localId)) return;
    const controller = new AbortController();
    activeUploads.current.set(entry.localId, controller);
    const update = (patch: Partial<PendingUpload>) => updatePendingUploadsForGroup(targetGroupId,
      (current) => current.map((item) => item.localId === entry.localId ? { ...item, ...patch } : item));
    try {
      let uploaded = entry.uploadedFile;
      if (!uploaded) {
        const result = await uploadFileViaMultipart(accessToken, 'CHAT_ATTACHMENT', targetGroupId, entry.file,
          (progress) => update({ progress }), controller.signal);
        if (result.finalized.kind !== 'CHAT_ATTACHMENT') throw new Error('上传结果类型不正确。');
        uploaded = result.finalized.file;
        update({ uploadedFile: uploaded });
      }
      controller.signal.throwIfAborted();
      update({ status: 'creating-message' });
      await createMessage(accessToken, targetGroupId, {
        type: uploaded.kindLabel === 'image' ? 'image' : 'file', clientMessageId: entry.localId,
        attachment: { fileId: uploaded.id }, replyToMessageId: entry.replyToMessageId || undefined,
      });
      updatePendingUploadsForGroup(targetGroupId, (current) => current.filter((item) => item.localId !== entry.localId));
    } catch (error) {
      update({ status: 'error', error: controller.signal.aborted ? '已取消' : error instanceof Error ? error.message : '上传失败' });
    } finally {
      activeUploads.current.delete(entry.localId);
    }
  }, [accessToken, updatePendingUploadsForGroup]);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!selectedGroupId || !files.length) return;
      const targetGroupId = selectedGroupId;
      const savedReplyToId = replyToMessageId;

      const entries: PendingUpload[] = files.map((file) => ({
        localId: createClientMessageId(),
        fileName: file.name,
        file,
        replyToMessageId: savedReplyToId,
        progress: { loaded: 0, total: file.size, percent: 0, speedBytesPerSec: 0 },
        status: 'uploading' as PendingStatus,
      }));

      updatePendingUploadsForGroup(targetGroupId, (prev) => [...prev, ...entries]);

      for (let i = 0; i < entries.length; i += 3) {
        const batch = entries.slice(i, i + 3).map((entry) => runUploadEntry(targetGroupId, entry));
        await Promise.all(batch);
      }

      setReplyToMessageId('');
      refetchMessages();
    },
    [refetchMessages, replyToMessageId, runUploadEntry, selectedGroupId, setReplyToMessageId, updatePendingUploadsForGroup],
  );

  const clearPendingError = useCallback((localId: string) => {
    activeUploads.current.get(localId)?.abort();
    updatePendingUploadsForGroup(selectedGroupId, (prev) => prev.filter((p) => p.localId !== localId));
    // Also remove failed optimistic text messages from cache.
    queryClient.setQueryData<{ groupId: string; items: MessageResponse[] }>(
      ['messages', selectedGroupId],
      (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.filter((item) => item.id !== localId),
        };
      },
    );
  }, [queryClient, selectedGroupId, updatePendingUploadsForGroup]);

  const retryFailedMessage = useCallback((localId: string) => {
    if (!selectedGroupId) return;
    const cached = queryClient.getQueryData<{ groupId: string; items: MessageResponse[] }>(
      ['messages', selectedGroupId],
    );
    const failedMessage = cached?.items.find((item) => item.id === localId && item.sendError);
    if (!failedMessage?.text) return;

    queryClient.setQueryData<{ groupId: string; items: MessageResponse[] }>(
      ['messages', selectedGroupId],
      (current) => current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === localId ? { ...item, isSending: true, sendError: undefined } : item,
            ),
          }
        : current,
    );
    trackSendingStart(selectedGroupId);
    void sendMessageMutation.mutateAsync({
      targetGroupId: selectedGroupId,
      text: failedMessage.text,
      localId,
      savedReplyToId: failedMessage.replyTo?.id,
    }).catch(() => undefined);
  }, [queryClient, selectedGroupId, sendMessageMutation]);

  const retryPendingUpload = useCallback((localId: string) => {
    const entry = pendingUploads.find((item) => item.localId === localId);
    if (!entry?.file || !selectedGroupId || activeUploads.current.has(localId)) return;
    updatePendingUploadsForGroup(selectedGroupId, (current) => current.map((item) => item.localId === localId
      ? { ...item, error: undefined, status: entry.uploadedFile ? 'creating-message' : 'uploading' } : item));
    void runUploadEntry(selectedGroupId, entry).finally(refetchMessages);
  }, [pendingUploads, refetchMessages, runUploadEntry, selectedGroupId, updatePendingUploadsForGroup]);

  return {
    composer: {
      ...clipboardBatch,
      onPasteContent: (parts: ClipboardPart[]) => {
        clipboardBatch.onPasteContent(parts);
        if (selectedGroupId && parts.length) setReplyToMessageId('');
      },
      channelName,
      isSending: sendMessageMutation.isPending,
      isUploading: pendingUploads.some((p) => p.status === 'uploading'),
      onChange: setDraft,
      draftStore,
      groupMembers,
      onClearReply: () => setReplyToMessageId(''),
      onSeedMention: (mention: string) => {
        const normalizedMention = mention.trim();
        if (!normalizedMention) {
          return;
        }

        setComposerSeedText(normalizedMention);
      },
      onPickAttachments: (files: File[]) => {
        if (!files.length) return;
        const oversizedFile = files.find((file) => file.size > chatAttachmentMaxBytes);
        if (oversizedFile) {
          onError(`文件“${oversizedFile.name}”超过 ${chatAttachmentMaxMB ?? DEFAULT_CHAT_ATTACHMENT_MAX_MB}MB 限制。`);
          return;
        }
        void uploadFiles(files);
      },
      onSend: sendDraft,
      replyTarget: getReplyTarget(messages, replyToMessageId),
      get text() { return draftStore.getState().text; },
    },
    replyToMessageId,
    pendingUploads,
    clearPendingError,
    retryFailedMessage,
    retryPendingUpload,
  };
}
