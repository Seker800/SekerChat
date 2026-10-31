import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';

const terminalEvents = new Set(['completed', 'failed', 'cancelled', 'not_modified']);

export async function analyzeDownloadLogs(paths, { userId, since } = {}) {
  const observations = new Map();
  let malformedLines = 0;
  const sinceMs = since ? Date.parse(since) : -Infinity;
  if (Number.isNaN(sinceMs)) throw new Error('Invalid --since timestamp.');
  for (const path of paths) {
    const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        malformedLines++;
        continue;
      }
      if (
        !row ||
        !['server', 'client_reported'].includes(row.source) ||
        typeof row.downloadId !== 'string' ||
        !Number.isFinite(Date.parse(row.recordedAt))
      ) {
        malformedLines++;
        continue;
      }
      if ((userId && row.userId !== userId) || Date.parse(row.recordedAt) < sinceMs) continue;
      const key = JSON.stringify([row.userId, row.downloadId, row.source]);
      const existing = observations.get(key);
      // A delayed heartbeat must not overwrite a terminal event; duplicate exports are harmless.
      if (existing && terminalEvents.has(existing.event) && !terminalEvents.has(row.event))
        continue;
      if (!existing || Date.parse(row.recordedAt) >= Date.parse(existing.recordedAt))
        observations.set(key, { ...existing, ...row });
    }
  }
  const transfers = new Set();
  const sources = {};
  for (const row of observations.values()) {
    transfers.add(JSON.stringify([row.userId, row.downloadId]));
    const source = (sources[row.source] ??= {
      observations: 0,
      outcomes: {},
      cached: 0,
      speeds: [],
      slowest: [],
    });
    source.observations++;
    const outcome = terminalEvents.has(row.event) ? row.event : 'result_unknown';
    source.outcomes[outcome] = (source.outcomes[outcome] ?? 0) + 1;
    if (row.cacheStatus === 'browser_cache') {
      source.cached++;
      continue;
    }
    if (
      row.event === 'completed' &&
      Number.isFinite(row.averageBytesPerSecond) &&
      row.averageBytesPerSecond > 0
    ) {
      source.speeds.push(row.averageBytesPerSecond);
      source.slowest.push({
        downloadId: row.downloadId,
        userId: row.userId,
        resourceKind: row.resourceKind ?? null,
        resourceId: row.resourceId ?? null,
        recordedAt: row.recordedAt,
        bytes: row.bytes,
        elapsedMs: row.elapsedMs,
        maxGapMs: row.maxGapMs,
        bytesPerSecond: row.averageBytesPerSecond,
        cacheStatus: row.cacheStatus ?? 'not_measured',
      });
      source.slowest.sort((a, b) => a.bytesPerSecond - b.bytesPerSecond);
      if (source.slowest.length > 20) source.slowest.pop();
    }
  }
  for (const source of Object.values(sources)) {
    source.speeds.sort((a, b) => a - b);
    const count = source.speeds.length;
    source.medianBytesPerSecond = count
      ? (source.speeds[Math.floor((count - 1) / 2)] + source.speeds[Math.floor(count / 2)]) / 2
      : null;
    delete source.speeds;
  }
  return { transfers: transfers.size, malformedLines, sources };
}

async function main() {
  const paths = [];
  const options = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--user' || args[i] === '--since') {
      const option = args[i] === '--user' ? 'userId' : 'since';
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing filter value.');
      options[option] = args[++i];
    } else if (args[i].startsWith('--')) throw new Error('Unknown option.');
    else paths.push(args[i]);
  }
  if (!paths.length)
    throw new Error(
      'Usage: node scripts/analyze-download-logs.mjs <log.jsonl...> [--user ID] [--since ISO_DATE]',
    );
  process.stdout.write(`${JSON.stringify(await analyzeDownloadLogs(paths, options), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
