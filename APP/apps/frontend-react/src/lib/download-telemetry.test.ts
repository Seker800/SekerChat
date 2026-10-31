import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLoggedDownload } from './download-telemetry';

describe('download telemetry', () => {
  afterEach(() => vi.useRealTimers());

  it('counts delivered bytes, wait time, transfer speed and pauses without buffering the body', async () => {
    let now = 0;
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const report = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          source = controller;
        },
      }),
      {
        headers: { 'content-length': '6' },
      },
    );
    const pending = fetchLoggedDownload(
      async () => {
        now = 100;
        return response;
      },
      '/api/groups/g/files/f/content',
      {},
      120_000,
      { report, now: () => now },
    );
    const result = await pending;
    const body = result.body!.getReader();
    now = 200;
    source.enqueue(new Uint8Array([1, 2]));
    expect((await body.read()).value).toEqual(new Uint8Array([1, 2]));
    now = 1200;
    source.enqueue(new Uint8Array([3, 4, 5, 6]));
    await body.read();
    source.close();
    await body.read();
    expect(report.mock.calls[0][0].event).toBe('started');
    expect(report.mock.calls.at(-1)![0]).toMatchObject({
      event: 'completed',
      bytes: 6,
      elapsedMs: 1200,
      firstByteMs: 200,
      maxGapMs: 1000,
      expectedBytes: 6,
    });
    expect(report.mock.calls.at(-1)![0].downloadId).toBe(report.mock.calls[0][0].downloadId);
  });

  it('reports failed and cancelled transfers once, retaining partial bytes', async () => {
    const report = vi.fn();
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          source = c;
        },
      }),
    );
    const result = await fetchLoggedDownload(
      async () => response,
      '/api/album/photos/p/content',
      {},
      1000,
      { report },
    );
    const reader = result.body!.getReader();
    source.enqueue(new Uint8Array(10));
    await reader.read();
    source.error(new TypeError('private URL or secret must not be reported'));
    await expect(reader.read()).rejects.toThrow();
    expect(report.mock.calls.at(-1)![0]).toMatchObject({
      event: 'failed',
      bytes: 10,
      errorCode: 'network',
    });
    expect(JSON.stringify(report.mock.calls)).not.toContain('private URL');

    const cancelledReport = vi.fn();
    const cancelled = await fetchLoggedDownload(
      async () => new Response(new ReadableStream()),
      '/api/album/photos/p/content',
      {},
      1000,
      { report: cancelledReport },
    );
    await cancelled.body!.cancel();
    expect(cancelledReport.mock.calls.filter(([row]) => row.event === 'cancelled')).toHaveLength(1);
  });

  it('keeps downloads working when the reporter throws and ignores non-download requests', async () => {
    const report = vi.fn(() => {
      throw new Error('logging unavailable');
    });
    const fetcher = vi.fn(async () => new Response('ok'));
    const content = await fetchLoggedDownload(fetcher, '/api/groups/g/files/f/content', {}, 1000, {
      report,
    });
    expect(await content.text()).toBe('ok');
    report.mockClear();
    const ordinary = await fetchLoggedDownload(fetcher, '/api/groups', {}, 1000, { report });
    expect(await ordinary.text()).toBe('ok');
    expect(report).not.toHaveBeenCalled();
  });

  it('reports low-frequency progress so an abruptly closed page leaves a partial record', async () => {
    vi.useFakeTimers();
    const report = vi.fn();
    const result = await fetchLoggedDownload(
      async () => new Response(new ReadableStream()),
      '/api/groups/g/files/f/content',
      {},
      60_000,
      { report },
    );
    await vi.advanceTimersByTimeAsync(15_000);
    expect(report.mock.calls.some(([row]) => row.event === 'progress')).toBe(true);
    await result.body!.cancel();
    const count = report.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(report).toHaveBeenCalledTimes(count);
  });

  it('classifies HTTP, timeout, empty responses and early aborts without leaking error details', async () => {
    for (const [fetcher, event, errorCode] of [
      [async () => new Response('', { status: 503 }), 'failed', 'http'],
      [
        async () => {
          throw new DOMException('secret timeout detail', 'TimeoutError');
        },
        'failed',
        'timeout',
      ],
      [
        async () => {
          throw new DOMException('secret abort detail', 'AbortError');
        },
        'cancelled',
        'aborted',
      ],
      [async () => new Response(null, { status: 204 }), 'completed', null],
    ] as const) {
      const report = vi.fn();
      await fetchLoggedDownload(fetcher, '/api/subscriptions/attachments/a/content', {}, 1000, {
        report,
      }).catch(() => undefined);
      expect(report.mock.calls.at(-1)![0]).toMatchObject({
        event,
        errorCode,
        resourceKind: 'article_attachment',
        resourceId: 'a',
      });
      expect(JSON.stringify(report.mock.calls)).not.toContain('secret');
    }
    const report = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await fetchLoggedDownload(
      async () => new Response(),
      '/api/groups/g/files/f/content',
      { signal: controller.signal },
      1000,
      { report },
    );
    expect(report).not.toHaveBeenCalled();
  });

  it('recognizes browser-cache results and compressed lengths without claiming network bandwidth', async () => {
    vi.spyOn(performance, 'getEntriesByName').mockReturnValue([
      { startTime: 10, decodedBodySize: 3, transferSize: 0 },
    ] as PerformanceResourceTiming[]);
    const report = vi.fn();
    const result = await fetchLoggedDownload(
      async () =>
        new Response('abc', { headers: { 'content-length': '1', 'content-encoding': 'gzip' } }),
      '/api/groups/g/artifacts/a/content',
      {},
      1000,
      { report, now: () => 0 },
    );
    expect(await result.text()).toBe('abc');
    expect(report.mock.calls.at(-1)![0]).toMatchObject({
      cacheStatus: 'browser_cache',
      expectedBytes: null,
      resourceKind: 'artifact',
    });
    vi.restoreAllMocks();
  });
});
