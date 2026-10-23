import { useEffect, useRef, useState } from 'react';
import { createMessage, type MessageResponse } from '../../lib/messages-files-api';
import { uploadFileViaMultipart } from '../../lib/multipart-upload';
import { createClientMessageId } from '../../lib/client-message-id';
import {
  resolveClipboardImages,
  type ClipboardPart,
  type ResolvedClipboardPart,
} from './clipboard-content';

interface Options {
  accessToken: string;
  groupId: string;
  maxBytes: number;
  replyToMessageId: string;
  onMessage: (message: MessageResponse, groupId: string) => void;
}
interface Batch {
  options: Options;
  parts: ClipboardPart[];
  resolved?: ResolvedClipboardPart[];
  ids: string[];
  uploaded: Map<number, string>;
  sent: number;
  error?: string;
  running: boolean;
  controller: AbortController;
}
export interface PasteBatchStatus {
  sent: number;
  total: number;
  queued: number;
  error?: string;
  retry: () => void;
  discard: () => void;
}

export function useClipboardBatch(options: Options) {
  const queues = useRef(new Map<string, Batch[]>());
  const mounted = useRef(true);
  const [, refresh] = useState(0);
  const update = () => {
    if (mounted.current) refresh((value) => value + 1);
  };
  useEffect(() => {
    mounted.current = true;
    const currentQueues = queues.current;
    return () => {
      mounted.current = false;
      for (const queue of currentQueues.values())
        for (const batch of queue) batch.controller.abort();
      currentQueues.clear();
    };
  }, []);

  const run = async (groupId: string) => {
    const queue = queues.current.get(groupId);
    const batch = queue?.[0];
    if (!batch || batch.running || !mounted.current) return;
    batch.running = true;
    batch.error = undefined;
    update();
    const { accessToken, maxBytes, replyToMessageId, onMessage } = batch.options;
    const signal = batch.controller.signal;
    try {
      // Resolve every image before committing the first message; inaccessible images
      // must not silently turn a mixed paste into a text-only send.
      batch.resolved ??= await resolveClipboardImages(batch.parts, maxBytes, signal);
      while (batch.sent < batch.resolved.length) {
        signal.throwIfAborted();
        const index = batch.sent;
        const part = batch.resolved[index]!;
        let attachment: { fileId: string } | undefined;
        if (part.kind === 'image') {
          let fileId = batch.uploaded.get(index);
          if (!fileId) {
            const uploaded = await uploadFileViaMultipart(
              accessToken,
              'CHAT_ATTACHMENT',
              groupId,
              part.file,
              () => undefined,
              signal,
            );
            if (uploaded.finalized.kind !== 'CHAT_ATTACHMENT')
              throw new Error('上传结果类型不正确。');
            fileId = uploaded.finalized.file.id;
            batch.uploaded.set(index, fileId);
          }
          attachment = { fileId };
        }
        signal.throwIfAborted();
        const message = await createMessage(accessToken, groupId, {
          type: part.kind === 'text' ? 'text' : 'image',
          clientMessageId: batch.ids[index],
          ...(part.kind === 'text' ? { text: part.text } : { attachment }),
          replyToMessageId: replyToMessageId || undefined,
        });
        batch.sent++;
        if (mounted.current) onMessage(message, groupId);
        update();
      }
      queue!.shift();
      if (!queue!.length) queues.current.delete(groupId);
    } catch (error) {
      if (!signal.aborted)
        batch.error = error instanceof Error ? error.message : '图文粘贴发送失败。';
    } finally {
      batch.running = false;
      update();
    }
    if (!batch.error && !signal.aborted) void run(groupId);
  };
  const onPasteContent = (parts: ClipboardPart[]) => {
    if (!options.groupId || !parts.length) return;
    const queue = queues.current.get(options.groupId) ?? [];
    queue.push({
      options,
      parts,
      ids: parts.map(() => createClientMessageId()),
      uploaded: new Map(),
      sent: 0,
      running: false,
      controller: new AbortController(),
    });
    queues.current.set(options.groupId, queue);
    update();
    if (!queue[0]!.error) void run(options.groupId);
  };
  const queue = queues.current.get(options.groupId);
  const batch = queue?.[0];
  const pasteBatch: PasteBatchStatus | null = batch
    ? {
        sent: batch.sent,
        total: batch.parts.length,
        queued: queue!.length - 1,
        error: batch.error,
        retry: () => {
          if (batch.error) void run(options.groupId);
        },
        discard: () => {
          if (batch.running) return;
          batch.controller.abort();
          queue!.shift();
          if (!queue!.length) queues.current.delete(options.groupId);
          update();
          void run(options.groupId);
        },
      }
    : null;
  return { onPasteContent, pasteBatch };
}
