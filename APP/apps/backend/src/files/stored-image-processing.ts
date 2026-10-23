import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ObjectStorageGateway } from './object-storage.gateway';

// Single active backend instance: serialize native image work across chat and
// album jobs. Input size affects disk use, not a Buffer of the complete original.
let tail: Promise<unknown> = Promise.resolve();

export function withStoredImage<T>(
  storage: Pick<ObjectStorageGateway, 'get'>,
  key: string,
  process: (filename: string) => Promise<T>,
): Promise<T> {
  const work = tail.then(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sekerchat-image-'));
    let stream: Awaited<ReturnType<ObjectStorageGateway['get']>>['stream'] | undefined;
    try {
      const filename = join(directory, 'input');
      ({ stream } = await storage.get(key));
      await pipeline(stream, createWriteStream(filename, { flags: 'wx', mode: 0o600 }));
      return await process(filename);
    } finally {
      stream?.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  });
  tail = work.catch(() => undefined);
  return work;
}
