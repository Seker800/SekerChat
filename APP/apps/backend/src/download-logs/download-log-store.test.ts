import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DownloadLogStore } from './download-log-store';

test('download journal preserves ordered JSON lines and prunes only expired download logs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'download-log-'));
  try {
    await writeFile(join(directory, 'downloads-2026-09-01.jsonl'), '{}\n');
    await writeFile(join(directory, 'unrelated.jsonl'), 'keep');
    const store = new DownloadLogStore(directory, { now: () => new Date('2026-10-31T00:00:00Z') });
    store.record({ source: 'server', event: 'started', downloadId: 'one' });
    store.record({ source: 'server', event: 'completed', downloadId: 'one', bytes: 4000 });
    await store.flush();
    const rows = (await readFile(join(directory, 'downloads-2026-10-31.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      rows.map((row) => row.event),
      ['started', 'completed'],
    );
    assert.equal(rows[1].bytes, 4000);
    assert.equal(rows[0].recordedAt, '2026-10-31T00:00:00.000Z');
    assert.deepEqual((await readdir(directory)).sort(), [
      'downloads-2026-10-31.jsonl',
      'unrelated.jsonl',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('journal bounds disk usage, reports loss, and recovers on the next day', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'download-log-'));
  let time = new Date('2026-10-31T00:00:00Z');
  let warnings = 0;
  try {
    const store = new DownloadLogStore(directory, {
      now: () => time,
      maxDailyBytes: 200,
      warn: () => warnings++,
    });
    for (let i = 0; i < 5; i++) store.record({ event: 'started', downloadId: String(i) });
    await store.flush();
    const before = await readFile(join(directory, 'downloads-2026-10-31.jsonl'), 'utf8');
    assert.ok(Buffer.byteLength(before) <= 200);
    assert.ok(warnings > 0);
    time = new Date('2026-11-01T00:00:00Z');
    store.record({ event: 'started', downloadId: 'next-day' });
    await store.flush();
    assert.match(await readFile(join(directory, 'downloads-2026-11-01.jsonl'), 'utf8'), /next-day/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('journal failures never reject callers or leave an unhandled rejection', async () => {
  let warnings = 0;
  const directory = await mkdtemp(join(tmpdir(), 'download-log-'));
  const blocked = join(directory, 'file');
  try {
    await writeFile(blocked, 'not a directory');
    const store = new DownloadLogStore(blocked, { warn: () => warnings++ });
    assert.doesNotThrow(() => store.record({ event: 'completed' }));
    await store.flush();
    assert.ok(warnings > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
