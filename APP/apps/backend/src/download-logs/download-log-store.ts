import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';

interface StoreOptions {
  now?: () => Date;
  maxDailyBytes?: number;
  warn?: () => void;
}

/** Single backend process owns this journal. It is diagnostic data, not an audit ledger. */
export class DownloadLogStore {
  private tail: Promise<void> = Promise.resolve();
  private pending = 0;
  private day = '';
  private bytes = 0;
  private lastWarning = -Infinity;
  private readonly now: () => Date;
  private readonly maxDailyBytes: number;

  constructor(
    private readonly directory: string,
    private readonly options: StoreOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxDailyBytes = options.maxDailyBytes ?? 20 * 1024 * 1024;
  }

  record(record: Record<string, unknown>): void {
    const timestamp = this.now();
    const line = `${JSON.stringify({ ...record, schemaVersion: 1, recordedAt: timestamp.toISOString() })}\n`;
    this.enqueue(async () => {
      const day = timestamp.toISOString().slice(0, 10);
      const path = join(this.directory, `downloads-${day}.jsonl`);
      if (this.day !== day) {
        await this.prune(timestamp);
        this.bytes = await stat(path).then(
          (info) => info.size,
          (error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT') return 0;
            throw error;
          },
        );
        this.day = day;
      }
      const size = Buffer.byteLength(line);
      if (this.bytes + size > this.maxDailyBytes) {
        this.warn();
        return;
      }
      await appendFile(path, line, { mode: 0o600 });
      this.bytes += size;
    });
  }

  cleanup(): void {
    this.enqueue(() => this.prune(this.now()));
  }

  async flush(): Promise<void> {
    await this.tail;
  }

  private enqueue(work: () => Promise<void>): void {
    // Bound memory if storage stalls. Loss is reported, never allowed to stall file delivery.
    if (this.pending >= 256) {
      this.warn();
      return;
    }
    this.pending++;
    this.tail = this.tail
      .then(work)
      .catch(() => this.warn())
      .finally(() => {
        this.pending--;
      });
  }

  private warn(): void {
    const now = this.now().getTime();
    if (now - this.lastWarning < 60_000) return;
    this.lastWarning = now;
    this.options.warn?.();
  }

  private async prune(now: Date): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const cutoff = new Date(now.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    for (const name of await readdir(this.directory)) {
      const match = /^downloads-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
      if (match && match[1] < cutoff) await unlink(join(this.directory, name));
    }
  }
}
