// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadFileViaMultipart } from './multipart-upload';

const initiateUploadMock = vi.fn();
const uploadPartMock = vi.fn();
const completeUploadMock = vi.fn();
const abortUploadMock = vi.fn();
const getUploadedPartsMock = vi.fn();

vi.mock('./uploads-api', () => ({
  initiateUpload: (...args: unknown[]) => initiateUploadMock(...args),
  uploadPart: (...args: unknown[]) => uploadPartMock(...args),
  completeUpload: (...args: unknown[]) => completeUploadMock(...args),
  abortUpload: (...args: unknown[]) => abortUploadMock(...args),
  getUploadedParts: (...args: unknown[]) => getUploadedPartsMock(...args),
}));

describe('uploadFileViaMultipart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('uploads file parts through the app API and completes the upload session', async () => {
    initiateUploadMock.mockResolvedValue({
      id: 'upload-1',
      partSizeBytes: 5,
    });
    uploadPartMock
      .mockResolvedValueOnce({ uploadSessionId: 'upload-1', partNumber: 1, etag: 'etag-part-1' })
      .mockResolvedValueOnce({ uploadSessionId: 'upload-1', partNumber: 2, etag: 'etag-part-2' });
    completeUploadMock.mockResolvedValue({
      kind: 'CHAT_ATTACHMENT',
      file: { id: 'file-1' },
    });

    const file = new File(['123456789'], 'demo.bin', {
      type: 'application/octet-stream',
      lastModified: 1700000000000,
    });
    const progressEvents: Array<{ loaded: number; total: number; percent: number }> = [];

    const result = await uploadFileViaMultipart(
      'token',
      'CHAT_ATTACHMENT',
      'group-1',
      file,
      (progress) => {
        progressEvents.push({
          loaded: progress.loaded,
          total: progress.total,
          percent: progress.percent,
        });
      },
    );

    expect(initiateUploadMock).toHaveBeenCalledWith('token', {
      kind: 'CHAT_ATTACHMENT',
      groupId: 'group-1',
      fileName: 'demo.bin',
      mimeType: 'application/octet-stream',
      size: 9,
    });
    expect(uploadPartMock).toHaveBeenCalledTimes(2);
    expect(uploadPartMock).toHaveBeenCalledWith(
      'token',
      'upload-1',
      1,
      expect.any(Blob),
      undefined,
    );
    expect(uploadPartMock).toHaveBeenCalledWith(
      'token',
      'upload-1',
      2,
      expect.any(Blob),
      undefined,
    );
    expect(completeUploadMock).toHaveBeenCalledWith('token', 'upload-1', [
      { partNumber: 1, etag: 'etag-part-1' },
      { partNumber: 2, etag: 'etag-part-2' },
    ]);
    expect(progressEvents.at(-1)).toEqual({ loaded: 9, total: 9, percent: 100 });
    expect(result.finalized).toEqual({ kind: 'CHAT_ATTACHMENT', file: { id: 'file-1' } });
  });

  it('passes inline-image usage only for subscription uploads and isolates their resume key', async () => {
    initiateUploadMock.mockResolvedValue({ id: 'subscription-image-upload', partSizeBytes: 5 });
    uploadPartMock.mockResolvedValue({
      uploadSessionId: 'subscription-image-upload',
      partNumber: 1,
      etag: 'etag-image',
    });
    completeUploadMock.mockResolvedValue({
      kind: 'SUBSCRIPTION_ATTACHMENT',
      attachment: { id: 'image-1', usage: 'INLINE_IMAGE' },
    });
    const file = new File(['image'], 'article.png', {
      type: 'image/png',
      lastModified: 1700000000000,
    });

    await uploadFileViaMultipart(
      'token',
      'SUBSCRIPTION_ATTACHMENT',
      'post-1',
      file,
      () => undefined,
      undefined,
      { subscriptionUsage: 'INLINE_IMAGE' },
    );

    expect(initiateUploadMock).toHaveBeenCalledWith('token', {
      kind: 'SUBSCRIPTION_ATTACHMENT',
      postId: 'post-1',
      fileName: 'article.png',
      mimeType: 'image/png',
      size: 5,
      subscriptionUsage: 'INLINE_IMAGE',
    });
    expect(
      localStorage.getItem(
        'sekerchat:upload:SUBSCRIPTION_ATTACHMENT:INLINE_IMAGE:post-1:article.png:5:1700000000000',
      ),
    ).toBeNull();
  });

  it('limits concurrent proxied part uploads', async () => {
    initiateUploadMock.mockResolvedValue({
      id: 'upload-concurrency',
      partSizeBytes: 1,
    });
    completeUploadMock.mockResolvedValue({
      kind: 'CHAT_ATTACHMENT',
      file: { id: 'file-concurrency' },
    });

    let activeUploads = 0;
    let maxActiveUploads = 0;
    uploadPartMock.mockImplementation(async (_accessToken, uploadSessionId, partNumber) => {
      activeUploads += 1;
      maxActiveUploads = Math.max(maxActiveUploads, activeUploads);
      await new Promise((resolve) => setTimeout(resolve, 0));
      activeUploads -= 1;
      return { uploadSessionId, partNumber, etag: `etag-part-${partNumber}` };
    });

    const file = new File(['1234567890'], 'ten-parts.bin', {
      type: 'application/octet-stream',
      lastModified: 1700000000000,
    });

    await uploadFileViaMultipart('token', 'CHAT_ATTACHMENT', 'group-1', file, () => undefined);

    expect(uploadPartMock).toHaveBeenCalledTimes(10);
    expect(maxActiveUploads).toBeLessThanOrEqual(4);
  });

  it('leaves session intact when a part fails (not user-cancelled)', async () => {
    vi.useFakeTimers();
    initiateUploadMock.mockResolvedValue({
      id: 'upload-2',
      partSizeBytes: 5,
    });
    uploadPartMock.mockRejectedValue(new Error('Part upload failed'));

    const file = new File(['1234'], 'demo.bin', {
      type: 'application/octet-stream',
      lastModified: 1700000000000,
    });

    const promise = expect(
      uploadFileViaMultipart('token', 'ARTIFACT', 'group-1', file, () => undefined),
    ).rejects.toThrow('Part upload failed');

    // Advance past all retry backoffs (2s + 8s + 30s)
    await vi.advanceTimersByTimeAsync(50000);
    await promise;

    // Should NOT abort — leave session for future resume
    expect(abortUploadMock).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('aborts the upload session on user cancel', async () => {
    initiateUploadMock.mockResolvedValue({
      id: 'upload-3',
      partSizeBytes: 5,
    });

    const controller = new AbortController();
    uploadPartMock.mockImplementation(() => {
      controller.abort();
      return Promise.reject(new DOMException('Aborted', 'AbortError'));
    });

    const file = new File(['123456789'], 'demo.bin', {
      type: 'application/octet-stream',
      lastModified: 1700000000000,
    });

    await expect(
      uploadFileViaMultipart(
        'token',
        'CHAT_ATTACHMENT',
        'group-1',
        file,
        () => undefined,
        controller.signal,
      ),
    ).rejects.toThrow();

    expect(abortUploadMock).toHaveBeenCalledWith('token', 'upload-3');
  });

  it('retries a part on transient failure', async () => {
    initiateUploadMock.mockResolvedValue({
      id: 'upload-4',
      partSizeBytes: 5,
    });
    uploadPartMock
      .mockRejectedValueOnce(new Error('Part upload failed'))
      .mockResolvedValueOnce({ uploadSessionId: 'upload-4', partNumber: 1, etag: 'etag-part-1' });
    completeUploadMock.mockResolvedValue({
      kind: 'CHAT_ATTACHMENT',
      file: { id: 'file-4' },
    });

    const file = new File(['12345'], 'demo.bin', {
      type: 'application/octet-stream',
      lastModified: 1700000000000,
    });

    const result = await uploadFileViaMultipart(
      'token',
      'CHAT_ATTACHMENT',
      'group-1',
      file,
      () => undefined,
    );

    expect(uploadPartMock).toHaveBeenCalledTimes(2);
    expect(completeUploadMock).toHaveBeenCalled();
    expect(result.finalized).toEqual({ kind: 'CHAT_ATTACHMENT', file: { id: 'file-4' } });
  });

  it('resumes from a persisted session skipping completed parts', async () => {
    // Simulate a previous session (key includes kind + lastModified)
    localStorage.setItem(
      'sekerchat:upload:CHAT_ATTACHMENT:group-1:demo.bin:9:1700000000000',
      'upload-resume-1',
    );

    getUploadedPartsMock.mockResolvedValue({
      uploadSessionId: 'upload-resume-1',
      partSizeBytes: 5,
      parts: [{ partNumber: 1, etag: 'etag-part-1', size: 5 }],
    });

    uploadPartMock.mockResolvedValueOnce({
      uploadSessionId: 'upload-resume-1',
      partNumber: 2,
      etag: 'etag-part-2',
    });
    completeUploadMock.mockResolvedValue({
      kind: 'CHAT_ATTACHMENT',
      file: { id: 'file-resumed' },
    });

    const file = new File(['123456789'], 'demo.bin', {
      type: 'application/octet-stream',
      lastModified: 1700000000000,
    });

    const result = await uploadFileViaMultipart(
      'token',
      'CHAT_ATTACHMENT',
      'group-1',
      file,
      () => undefined,
    );

    // Should NOT re-initiate
    expect(initiateUploadMock).not.toHaveBeenCalled();

    expect(uploadPartMock).toHaveBeenCalledTimes(1);
    expect(uploadPartMock).toHaveBeenCalledWith(
      'token',
      'upload-resume-1',
      2,
      expect.any(Blob),
      undefined,
    );

    expect(completeUploadMock).toHaveBeenCalledWith('token', 'upload-resume-1', [
      { partNumber: 1, etag: 'etag-part-1' },
      { partNumber: 2, etag: 'etag-part-2' },
    ]);

    expect(result.finalized).toEqual({ kind: 'CHAT_ATTACHMENT', file: { id: 'file-resumed' } });

    // localStorage should be cleaned after completion
    expect(
      localStorage.getItem('sekerchat:upload:CHAT_ATTACHMENT:group-1:demo.bin:9:1700000000000'),
    ).toBeNull();
  });

  it('falls back to new session when persisted session is gone', async () => {
    localStorage.setItem(
      'sekerchat:upload:ARTIFACT:group-1:stale.bin:99:1700000000000',
      'upload-gone',
    );

    getUploadedPartsMock.mockRejectedValue(new Error('Upload session not found'));

    initiateUploadMock.mockResolvedValue({
      id: 'upload-fresh',
      partSizeBytes: 5,
    });
    uploadPartMock.mockResolvedValueOnce({
      uploadSessionId: 'upload-fresh',
      partNumber: 1,
      etag: 'etag-fresh',
    });
    completeUploadMock.mockResolvedValue({
      kind: 'ARTIFACT',
      artifact: { id: 'artifact-fresh' },
    });

    const file = new File(['xyz'], 'stale.bin', {
      type: 'application/octet-stream',
      lastModified: 1700000000000,
    });

    const result = await uploadFileViaMultipart(
      'token',
      'ARTIFACT',
      'group-1',
      file,
      () => undefined,
    );

    expect(initiateUploadMock).toHaveBeenCalled();
    expect(result.finalized).toEqual({ kind: 'ARTIFACT', artifact: { id: 'artifact-fresh' } });
  });
});
