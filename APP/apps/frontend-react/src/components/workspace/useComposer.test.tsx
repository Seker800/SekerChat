import '@testing-library/jest-dom/vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useComposer } from './useComposer';
import type { MessageResponse } from '../../lib/messages-files-api';

const createMessageMock = vi.fn();
const uploadFileViaMultipartMock = vi.fn();
const FIVE_GB_BYTES = 5 * 1024 * 1024 * 1024;
const FOUR_GB_BYTES = 4 * 1024 * 1024 * 1024;

function makeUploadableFile(name: string, type: string) {
  const file = new File(['large'], name, { type });
  Object.defineProperty(file, 'size', {
    configurable: true,
    value: FIVE_GB_BYTES + 1,
  });
  return file;
}

vi.mock('../../lib/messages-files-api', async () => {
  const actual = await vi.importActual<typeof import('../../lib/messages-files-api')>('../../lib/messages-files-api');
  return {
    ...actual,
    createMessage: (...args: unknown[]) => createMessageMock(...args),
  };
});

vi.mock('../../lib/multipart-upload', () => ({
  uploadFileViaMultipart: (...args: unknown[]) => uploadFileViaMultipartMock(...args),
}));

vi.mock('../../hooks/localMessageTracker', () => ({
  trackLocallySentMessage: vi.fn(),
  trackSendingEnd: vi.fn(),
  trackSendingStart: vi.fn(),
}));

function createWrapper(queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('useComposer pending uploads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps upload failures scoped to the originating group', async () => {
    uploadFileViaMultipartMock.mockRejectedValue(new Error('Upload failed: 413'));

    const { result, rerender } = renderHook(
      ({ selectedGroupId }) =>
        useComposer({
          accessToken: 'token',
          chatAttachmentMaxMB: 10 * 1024,
          selectedGroupId,
          messages: [],
          channelName: 'General',
          currentUser: {
            id: 'user-1',
            email: 'user@example.com',
            displayName: 'User',
            avatarUrl: null,
          },
          onError: vi.fn(),
          refetchMessages: vi.fn(),
          groupMembers: [],
        }),
      {
        initialProps: { selectedGroupId: 'group-1' },
        wrapper: createWrapper(),
      },
    );

    await act(async () => {
      result.current.composer.onPickAttachments([
        makeUploadableFile('huge.zip', 'application/zip'),
      ]);
    });

    await waitFor(() => {
      expect(result.current.pendingUploads).toHaveLength(1);
    });
    expect(result.current.pendingUploads[0]?.error).toBe('Upload failed: 413');

    rerender({ selectedGroupId: 'group-2' });
    expect(result.current.pendingUploads).toHaveLength(0);

    rerender({ selectedGroupId: 'group-1' });
    expect(result.current.pendingUploads).toHaveLength(1);
    expect(result.current.pendingUploads[0]?.error).toBe('Upload failed: 413');
  });

  it('retries a failed upload with the original file', async () => {
    const uploadedFile = makeUploadableFile('huge.zip', 'application/zip');
    uploadFileViaMultipartMock
      .mockRejectedValueOnce(new Error('Upload failed: 413'))
      .mockResolvedValueOnce({
        finalized: {
          kind: 'CHAT_ATTACHMENT',
          file: { id: 'file-1', kindLabel: 'file', originalName: 'huge.zip' },
        },
      });
    createMessageMock.mockResolvedValueOnce({
      id: 'message-file-1',
      groupId: 'group-1',
      senderId: 'user-1',
      type: 'file',
      text: null,
      revokedAt: null,
      editedAt: null,
      mentionedUserIds: [],
      replyTo: null,
      attachment: null,
      readReceipt: null,
      createdAt: '2026-05-11T08:00:00.000Z',
      sender: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        avatarUrl: null,
      },
    });

    const refetchMessages = vi.fn();
    const { result } = renderHook(
      () =>
        useComposer({
          accessToken: 'token',
          chatAttachmentMaxMB: 10 * 1024,
          selectedGroupId: 'group-1',
          messages: [],
          channelName: 'General',
          currentUser: {
            id: 'user-1',
            email: 'user@example.com',
            displayName: 'User',
            avatarUrl: null,
          },
          onError: vi.fn(),
          refetchMessages,
          groupMembers: [],
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await act(async () => {
      result.current.composer.onPickAttachments([uploadedFile]);
    });

    await waitFor(() => {
      expect(result.current.pendingUploads[0]?.status).toBe('error');
    });

    const failedLocalId = result.current.pendingUploads[0]!.localId;

    act(() => {
      result.current.retryPendingUpload(failedLocalId);
    });

    await waitFor(() => {
      expect(uploadFileViaMultipartMock).toHaveBeenCalledTimes(2);
    });
    expect(uploadFileViaMultipartMock).toHaveBeenLastCalledWith(
      'token',
      'CHAT_ATTACHMENT',
      'group-1',
      uploadedFile,
      expect.any(Function),
    );

    await waitFor(() => {
      expect(result.current.pendingUploads).toHaveLength(0);
    });
    expect(createMessageMock).toHaveBeenCalledWith(
      'token',
      'group-1',
      expect.objectContaining({
        type: 'file',
        attachment: { fileId: 'file-1' },
      }),
    );
    expect(refetchMessages).toHaveBeenCalled();
  });

  it('still sends text messages while a file upload is pending', async () => {
    let resolveUpload: ((value: { id: string; kind: 'file'; originalName: string }) => void) | undefined;
    uploadFileViaMultipartMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );
    createMessageMock.mockResolvedValueOnce({
      id: 'message-1',
      groupId: 'group-1',
      senderId: 'user-1',
      type: 'text',
      text: 'parallel text',
      revokedAt: null,
      editedAt: null,
      mentionedUserIds: [],
      replyTo: null,
      attachment: null,
      readReceipt: null,
      createdAt: '2026-05-11T08:00:00.000Z',
      sender: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        avatarUrl: null,
      },
    });

    const { result } = renderHook(
      () =>
        useComposer({
          accessToken: 'token',
          chatAttachmentMaxMB: 10 * 1024,
          selectedGroupId: 'group-1',
          messages: [],
          channelName: 'General',
          currentUser: {
            id: 'user-1',
            email: 'user@example.com',
            displayName: 'User',
            avatarUrl: null,
          },
          onError: vi.fn(),
          refetchMessages: vi.fn(),
          groupMembers: [],
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await act(async () => {
      result.current.composer.onPickAttachments([
        makeUploadableFile('large.bin', 'application/octet-stream'),
      ]);
    });

    await waitFor(() => {
      expect(result.current.composer.isUploading).toBe(true);
    });

    act(() => {
      result.current.composer.onChange('parallel text');
    });

    await act(async () => {
      result.current.composer.onSend();
    });

    await waitFor(() => {
      expect(createMessageMock).toHaveBeenCalledWith('token', 'group-1', expect.objectContaining({
        type: 'text',
        text: 'parallel text',
      }));
    });

    resolveUpload?.({
      finalized: {
        kind: 'CHAT_ATTACHMENT',
        file: { id: 'file-1', kindLabel: 'file', originalName: 'large.bin' },
      },
    } as never);
  });

  it('does not reject a 4GB file as below the 5GB max limit', async () => {
    const onError = vi.fn();
    uploadFileViaMultipartMock.mockResolvedValue({
      finalized: {
        kind: 'CHAT_ATTACHMENT',
        file: { id: 'file-1', kindLabel: 'file', originalName: 'four-gb.bin' },
      },
    });

    const { result } = renderHook(
      () =>
        useComposer({
          accessToken: 'token',
          chatAttachmentMaxMB: 5 * 1024,
          selectedGroupId: 'group-1',
          messages: [],
          channelName: 'General',
          currentUser: {
            id: 'user-1',
            email: 'user@example.com',
            displayName: 'User',
            avatarUrl: null,
          },
          onError,
          refetchMessages: vi.fn(),
          groupMembers: [],
        }),
      {
        wrapper: createWrapper(),
      },
    );

    const file = new File(['stub'], 'four-gb.bin', { type: 'application/octet-stream' });
    Object.defineProperty(file, 'size', {
      configurable: true,
      value: FOUR_GB_BYTES,
    });

    act(() => {
      result.current.composer.onPickAttachments([file]);
    });

    await waitFor(() => {
      expect(uploadFileViaMultipartMock).toHaveBeenCalledWith(
        'token',
        'CHAT_ATTACHMENT',
        'group-1',
        file,
        expect.any(Function),
      );
    });
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('useComposer text sending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queues rapid text sends for the same group instead of posting them concurrently', async () => {
    let resolveFirstSend: ((value: unknown) => void) | undefined;
    createMessageMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstSend = resolve;
          }),
      )
      .mockResolvedValueOnce({
        id: 'message-2',
        groupId: 'group-1',
        senderId: 'user-1',
        type: 'text',
        text: 'second',
        revokedAt: null,
        editedAt: null,
        mentionedUserIds: [],
        replyTo: null,
        attachment: null,
        readReceipt: null,
        createdAt: '2026-05-11T08:00:01.000Z',
        sender: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          avatarUrl: null,
        },
      });

    const { result } = renderHook(
      () =>
        useComposer({
          accessToken: 'token',
          selectedGroupId: 'group-1',
          messages: [],
          channelName: 'General',
          currentUser: {
            id: 'user-1',
            email: 'user@example.com',
            displayName: 'User',
            avatarUrl: null,
          },
          onError: vi.fn(),
          refetchMessages: vi.fn(),
          groupMembers: [],
        }),
      {
        wrapper: createWrapper(),
      },
    );

    act(() => {
      result.current.composer.onChange('first');
    });
    act(() => {
      result.current.composer.onSend();
    });

    act(() => {
      result.current.composer.onChange('second');
    });
    act(() => {
      result.current.composer.onSend();
    });

    await waitFor(() => {
      expect(createMessageMock).toHaveBeenCalledTimes(1);
    });
    expect(createMessageMock).toHaveBeenLastCalledWith(
      'token',
      'group-1',
      expect.objectContaining({ type: 'text', text: 'first' }),
    );

    resolveFirstSend?.({
      id: 'message-1',
      groupId: 'group-1',
      senderId: 'user-1',
      type: 'text',
      text: 'first',
      revokedAt: null,
      editedAt: null,
      mentionedUserIds: [],
      replyTo: null,
      attachment: null,
      readReceipt: null,
      createdAt: '2026-05-11T08:00:00.000Z',
      sender: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        avatarUrl: null,
      },
    });

    await waitFor(() => {
      expect(createMessageMock).toHaveBeenCalledTimes(2);
    });
    expect(createMessageMock).toHaveBeenLastCalledWith(
      'token',
      'group-1',
      expect.objectContaining({ type: 'text', text: 'second' }),
    );
  });

  it('does not clear a newly typed draft when an earlier queued send succeeds', async () => {
    let resolveFirstSend: ((value: unknown) => void) | undefined;
    createMessageMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSend = resolve;
        }),
    );

    const { result } = renderHook(
      () =>
        useComposer({
          accessToken: 'token',
          selectedGroupId: 'group-1',
          messages: [],
          channelName: 'General',
          currentUser: {
            id: 'user-1',
            email: 'user@example.com',
            displayName: 'User',
            avatarUrl: null,
          },
          onError: vi.fn(),
          refetchMessages: vi.fn(),
          groupMembers: [],
        }),
      {
        wrapper: createWrapper(),
      },
    );

    act(() => {
      result.current.composer.onChange('first');
    });
    act(() => {
      result.current.composer.onSend();
    });
    act(() => {
      result.current.composer.onChange('second');
    });

    await waitFor(() => {
      expect(createMessageMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveFirstSend?.({
        id: 'message-1',
        groupId: 'group-1',
        senderId: 'user-1',
        type: 'text',
        text: 'first',
        revokedAt: null,
        editedAt: null,
        mentionedUserIds: [],
        replyTo: null,
        attachment: null,
        readReceipt: null,
        createdAt: '2026-05-11T08:00:00.000Z',
        sender: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          avatarUrl: null,
        },
      });
      await Promise.resolve();
    });

    expect(result.current.composer.text).toBe('second');
  });

  it('replaces a confirmed send at its optimistic position without moving it after newer drafts', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

    let resolveFirstSend: ((value: unknown) => void) | undefined;
    createMessageMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstSend = resolve;
        }),
    );

    const { result } = renderHook(
      () =>
        useComposer({
          accessToken: 'token',
          selectedGroupId: 'group-1',
          messages: [],
          channelName: 'General',
          currentUser: {
            id: 'user-1',
            email: 'user@example.com',
            displayName: 'User',
            avatarUrl: null,
          },
          onError: vi.fn(),
          refetchMessages: vi.fn(),
          groupMembers: [],
        }),
      {
        wrapper: createWrapper(queryClient),
      },
    );

    act(() => {
      result.current.composer.onChange('first');
    });
    act(() => {
      result.current.composer.onSend();
    });
    act(() => {
      result.current.composer.onChange('2');
    });
    act(() => {
      result.current.composer.onSend();
    });
    act(() => {
      result.current.composer.onChange('3');
    });
    act(() => {
      result.current.composer.onSend();
    });

    await waitFor(() => {
      expect(createMessageMock).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      resolveFirstSend?.({
        id: 'message-1',
        groupId: 'group-1',
        senderId: 'user-1',
        type: 'text',
        text: 'first',
        revokedAt: null,
        editedAt: null,
        mentionedUserIds: [],
        replyTo: null,
        attachment: null,
        readReceipt: null,
        createdAt: '2026-05-11T08:00:00.000Z',
        sender: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          avatarUrl: null,
        },
      });
      await Promise.resolve();
    });

    const data = queryClient.getQueryData<{ items: Array<{ text: string | null }> }>(['messages', 'group-1']);
    expect(data?.items.map((item) => item.text)).toEqual(['first', '2', '3']);
  });

  it('reuses the optimistic UUID when a failed text message is retried', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    createMessageMock
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({
        id: 'message-1',
        groupId: 'group-1',
        senderId: 'user-1',
        type: 'text',
        text: 'retry safely',
        revokedAt: null,
        editedAt: null,
        mentionedUserIds: [],
        replyTo: null,
        attachment: null,
        readReceipt: null,
        createdAt: '2026-05-11T08:00:00.000Z',
        sender: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          avatarUrl: null,
        },
      });

    const { result } = renderHook(
      () => useComposer({
        accessToken: 'token',
        selectedGroupId: 'group-1',
        messages: [],
        channelName: 'General',
        currentUser: {
          id: 'user-1',
          email: 'user@example.com',
          displayName: 'User',
          avatarUrl: null,
        },
        onError: vi.fn(),
        refetchMessages: vi.fn(),
        groupMembers: [],
      }),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => result.current.composer.onChange('retry safely'));
    act(() => result.current.composer.onSend());

    await waitFor(() => expect(createMessageMock).toHaveBeenCalledTimes(1));
    const firstInput = createMessageMock.mock.calls[0]?.[2] as { clientMessageId: string };
    await waitFor(() => {
      const cached = queryClient.getQueryData<{ items: MessageResponse[] }>(['messages', 'group-1']);
      expect(cached?.items[0]?.sendError).toBeTruthy();
    });

    act(() => result.current.retryFailedMessage(firstInput.clientMessageId));

    await waitFor(() => expect(createMessageMock).toHaveBeenCalledTimes(2));
    const secondInput = createMessageMock.mock.calls[1]?.[2] as { clientMessageId: string };
    expect(secondInput.clientMessageId).toBe(firstInput.clientMessageId);
  });
});
