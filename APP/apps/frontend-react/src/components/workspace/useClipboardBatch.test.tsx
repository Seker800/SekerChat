import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipboardBatch } from './useClipboardBatch';

const create = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
vi.mock('../../lib/messages-files-api', () => ({ createMessage: create }));
vi.mock('../../lib/multipart-upload', () => ({ uploadFileViaMultipart: upload }));
const parts = [
  { kind: 'text' as const, text: 'before' },
  { kind: 'image' as const, file: new File(['image'], 'a.png', { type: 'image/png' }) },
  { kind: 'text' as const, text: 'after' },
];
function options(groupId = 'group-1') {
  return {
    accessToken: 'token',
    groupId,
    maxBytes: 1000,
    replyToMessageId: '',
    onMessage: vi.fn(),
    onError: vi.fn(),
  };
}

describe('clipboard batch sending', () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: 'sent' });
    upload
      .mockReset()
      .mockResolvedValue({
        finalized: { kind: 'CHAT_ATTACHMENT', file: { id: 'file-1', kindLabel: 'image' } },
      });
  });
  afterEach(cleanup);

  it('waits for each message and upload before sending the next part', async () => {
    let release!: (value: unknown) => void;
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useClipboardBatch(options()));
    act(() => result.current.onPasteContent(parts));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    expect(upload).not.toHaveBeenCalled();
    await act(async () => release({ id: 'first' }));
    await waitFor(() => expect(result.current.pasteBatch).toBeNull());
    expect(create.mock.calls.map((call) => call[2].type)).toEqual(['text', 'image', 'text']);
    expect(create.mock.calls.map((call) => call[1])).toEqual(['group-1', 'group-1', 'group-1']);
  });

  it('stops on failure and resumes with the same id and uploaded file', async () => {
    create
      .mockResolvedValueOnce({ id: 'first' })
      .mockRejectedValueOnce(new Error('response lost'))
      .mockResolvedValue({ id: 'sent' });
    const { result } = renderHook(() => useClipboardBatch(options()));
    act(() => result.current.onPasteContent(parts));
    await waitFor(() => expect(result.current.pasteBatch?.error).toContain('response lost'));
    expect(create).toHaveBeenCalledTimes(2);
    act(() => result.current.pasteBatch?.retry());
    await waitFor(() => expect(result.current.pasteBatch).toBeNull());
    expect(upload).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[2]?.[2]).toEqual(create.mock.calls[1]?.[2]);
    expect(create.mock.calls[3]?.[2].text).toBe('after');
  });

  it('keeps the original group when switching channels and queues consecutive pastes', async () => {
    let release!: (value: unknown) => void;
    create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { result, rerender } = renderHook(({ groupId }) => useClipboardBatch(options(groupId)), {
      initialProps: { groupId: 'group-1' },
    });
    act(() => {
      result.current.onPasteContent(parts);
      result.current.onPasteContent(parts);
    });
    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    rerender({ groupId: 'group-2' });
    expect(result.current.pasteBatch).toBeNull();
    await act(async () => release({ id: 'first' }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(6));
    expect(create.mock.calls.every((call) => call[1] === 'group-1')).toBe(true);
  });

  it('preflights all images before sending anything and allows discarding a failed batch', async () => {
    const { result } = renderHook(() => useClipboardBatch({ ...options(), maxBytes: 1 }));
    act(() => result.current.onPasteContent(parts));
    await waitFor(() => expect(result.current.pasteBatch?.error).toBeTruthy());
    expect(create).not.toHaveBeenCalled();
    act(() => result.current.pasteBatch?.discard());
    expect(result.current.pasteBatch).toBeNull();
  });
  it('discards a failed batch and starts the next queued paste', async () => {
    create.mockRejectedValueOnce(new Error('failed'));
    const { result } = renderHook(() => useClipboardBatch(options()));
    act(() => {
      result.current.onPasteContent(parts);
      result.current.onPasteContent([{ kind: 'text', text: 'next' }]);
    });
    await waitFor(() => expect(result.current.pasteBatch?.error).toBeTruthy());
    expect(result.current.pasteBatch?.queued).toBe(1);
    act(() => result.current.pasteBatch?.discard());
    await waitFor(() => expect(result.current.pasteBatch).toBeNull());
    expect(create.mock.calls[1]?.[2].text).toBe('next');
  });

  it('ignores empty targets and aborts an active upload when leaving the workspace', async () => {
    const empty = renderHook(() => useClipboardBatch(options('')));
    act(() => empty.result.current.onPasteContent(parts));
    expect(empty.result.current.pasteBatch).toBeNull();
    upload.mockImplementation(() => new Promise(() => undefined));
    const { result, unmount } = renderHook(() => useClipboardBatch(options()));
    act(() =>
      result.current.onPasteContent([
        { kind: 'image', file: new File(['x'], 'a.png', { type: 'image/png' }) },
      ]),
    );
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    const signal = upload.mock.calls[0]?.[5] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
});
