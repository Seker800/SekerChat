import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BROWSER_COOKIE_CREDENTIAL, registerAuthSessionController } from './api-core';
import { completeUpload, uploadPart } from './uploads-api';

class FakeXhr extends EventTarget {
  static requests: FakeXhr[] = [];
  upload = new EventTarget();
  status = 200;
  statusText = 'OK';
  responseText = JSON.stringify({ uploadSessionId: 'session', partNumber: 1, etag: 'etag' });
  withCredentials = false;
  headers: Record<string, string> = {};
  open = vi.fn();
  send = vi.fn();
  abort = vi.fn(() => this.dispatchEvent(new Event('abort')));
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  getAllResponseHeaders() {
    return 'content-type: application/json\r\nx-request-id: req-test';
  }
  constructor() {
    super();
    FakeXhr.requests.push(this);
  }
  progress(loaded: number) {
    this.upload.dispatchEvent(
      new ProgressEvent('progress', { loaded, total: 10, lengthComputable: true }),
    );
  }
  respond(status = 200, body = this.responseText) {
    this.status = status;
    this.responseText = body;
    this.dispatchEvent(new Event('load'));
  }
}

describe('uploadPart browser transport', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeXhr.requests = [];
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  });
  afterEach(() => {
    registerAuthSessionController(null);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reports bytes before the part response and preserves cookie authentication', async () => {
    const progress = vi.fn();
    const result = uploadPart(
      BROWSER_COOKIE_CREDENTIAL,
      'session',
      1,
      new Blob(['0123456789']),
      undefined,
      progress,
    );
    const xhr = FakeXhr.requests[0]!;
    expect(xhr).toBeDefined();
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers.authorization).toBeUndefined();
    expect(xhr.headers['content-type']).toBe('application/octet-stream');
    xhr.progress(4);
    expect(progress).toHaveBeenLastCalledWith(4);
    xhr.respond();
    await expect(result).resolves.toMatchObject({ etag: 'etag' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fails a stalled connection after 45 seconds', async () => {
    const result = expect(uploadPart('token', 'session', 1, new Blob(['x']))).rejects.toThrow(
      '45 秒',
    );
    await vi.advanceTimersByTimeAsync(45_000);
    await result;
    expect(FakeXhr.requests[0]!.abort).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps slow uploads alive while new bytes arrive', async () => {
    const result = uploadPart('token', 'session', 1, new Blob(['0123456789']));
    const xhr = FakeXhr.requests[0]!;
    for (let loaded = 1; loaded <= 4; loaded += 1) {
      await vi.advanceTimersByTimeAsync(40_000);
      xhr.progress(loaded);
    }
    expect(xhr.abort).not.toHaveBeenCalled();
    xhr.respond();
    await expect(result).resolves.toMatchObject({ etag: 'etag' });
  });

  it('bounds the server-response wait after all bytes are sent', async () => {
    const result = expect(uploadPart('token', 'session', 1, new Blob(['x']))).rejects.toThrow(
      '服务器',
    );
    FakeXhr.requests[0]!.upload.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(119_000);
    expect(FakeXhr.requests[0]!.abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    await result;
  });

  it('does not send an already-cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadPart('token', 'session', 1, new Blob(['x']), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(FakeXhr.requests).toHaveLength(0);
  });

  it('cancels in flight and removes timers', async () => {
    const controller = new AbortController();
    const result = expect(
      uploadPart('token', 'session', 1, new Blob(['x']), controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await result;
    expect(FakeXhr.requests[0]!.abort).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reuses session refresh and XHR on a 401', async () => {
    const refreshSession = vi.fn(async () => true);
    registerAuthSessionController({ refreshSession });
    const result = uploadPart(BROWSER_COOKIE_CREDENTIAL, 'session', 1, new Blob(['x']));
    FakeXhr.requests[0]!.respond(401, '{}');
    await vi.advanceTimersByTimeAsync(0);
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(FakeXhr.requests).toHaveLength(2);
    FakeXhr.requests[1]!.respond();
    await expect(result).resolves.toMatchObject({ etag: 'etag' });
  });

  it('preserves backend error text and status for retry decisions', async () => {
    const result = expect(uploadPart('token', 'session', 1, new Blob(['x']))).rejects.toMatchObject(
      { message: '没有上传权限', status: 403 },
    );
    FakeXhr.requests[0]!.respond(403, JSON.stringify({ message: '没有上传权限' }));
    await result;
  });

  it('reports network failures and clears timers', async () => {
    const result = expect(uploadPart('token', 'session', 1, new Blob(['x']))).rejects.toThrow(
      '网络',
    );
    FakeXhr.requests[0]!.dispatchEvent(new Event('error'));
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds finalization rather than waiting 55 minutes', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const result = expect(
      completeUpload('token', 'session', [{ partNumber: 1, etag: 'etag' }]),
    ).rejects.toThrow('完成上传超时');
    await vi.advanceTimersByTimeAsync(120_000);
    await result;
  });
});
