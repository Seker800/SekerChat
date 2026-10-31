import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeDownloadLogs } from './analyze-download-logs.mjs';

test('report joins progress by user, source and transfer, excludes cached speed and preserves unknown outcomes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'download-report-'));
  try {
    const path = join(root, 'downloads.jsonl');
    await writeFile(
      path,
      [
        {
          source: 'client_reported',
          userId: 'u',
          downloadId: 'a',
          event: 'started',
          recordedAt: '2026-10-31T00:00:00Z',
        },
        {
          source: 'server',
          userId: 'u',
          downloadId: 'a',
          event: 'completed',
          bytes: 10000,
          elapsedMs: 100,
          firstByteMs: 0,
          averageBytesPerSecond: 100000,
          recordedAt: '2026-10-31T00:00:00Z',
        },
        {
          source: 'client_reported',
          userId: 'u',
          downloadId: 'a',
          event: 'completed',
          bytes: 10000,
          elapsedMs: 1100,
          firstByteMs: 100,
          averageBytesPerSecond: 10000,
          cacheStatus: 'network',
          recordedAt: '2026-10-31T00:00:01Z',
        },
        {
          source: 'client_reported',
          userId: 'u',
          downloadId: 'b',
          event: 'completed',
          bytes: 50000,
          averageBytesPerSecond: 9999999,
          cacheStatus: 'browser_cache',
          recordedAt: '2026-10-31T00:00:01Z',
        },
        {
          source: 'client_reported',
          userId: 'u',
          downloadId: 'c',
          event: 'progress',
          bytes: 123,
          recordedAt: '2026-10-31T00:00:01Z',
        },
      ]
        .map((row) => JSON.stringify(row))
        .join('\n') + '\n{partial',
    );
    const report = await analyzeDownloadLogs([path]);
    assert.equal(report.transfers, 3);
    assert.equal(report.malformedLines, 1);
    assert.deepEqual(report.sources.client_reported.outcomes, { completed: 2, result_unknown: 1 });
    assert.equal(report.sources.client_reported.medianBytesPerSecond, 10000);
    assert.equal(report.sources.server.medianBytesPerSecond, 100000);
    assert.equal((await analyzeDownloadLogs([path], { userId: 'other' })).transfers, 0);
    assert.equal(
      (await analyzeDownloadLogs([path], { since: '2026-11-01T00:00:00Z' })).transfers,
      0,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
