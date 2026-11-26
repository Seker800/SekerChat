import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ObjectStorageGateway } from './object-storage.gateway';

// Single active backend instance: serialize native image work across chat and
// album jobs. Input size affects disk use, not a Buffer of the complete original.
let tail: Promise<unknown> = Promise.resolve();

async function withDownloadedImage<T>(
  storage: Pick<ObjectStorageGateway, 'get'>,
  key: string,
  process: (filename: string, sha256: string | null) => Promise<T>,
  options: { digest?: boolean } = {},
): Promise<T> {
  const work = tail.then(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sekerchat-image-'));
    let stream: Awaited<ReturnType<ObjectStorageGateway['get']>>['stream'] | undefined;
    try {
      const filename = join(directory, 'input');
      ({ stream } = await storage.get(key));
      if (options.digest) {
        // Hash while the object streams to disk so callers that need both a
        // checksum and header metadata pay for one download, not two.
        const hash = createHash('sha256');
        const hasher = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            hash.update(chunk);
            callback(null, chunk);
          },
        });
        await pipeline(stream, hasher, createWriteStream(filename, { flags: 'wx', mode: 0o600 }));
        return await process(filename, hash.digest('hex'));
      }
      await pipeline(stream, createWriteStream(filename, { flags: 'wx', mode: 0o600 }));
      return await process(filename, null);
    } finally {
      stream?.destroy();
      await rm(directory, { recursive: true, force: true });
    }
  });
  tail = work.catch(() => undefined);
  return work;
}

export function withStoredImage<T>(
  storage: Pick<ObjectStorageGateway, 'get'>,
  key: string,
  process: (filename: string) => Promise<T>,
): Promise<T> {
  return withDownloadedImage(storage, key, (filename) => process(filename));
}

/** One download that yields both the processed value and the object checksum. */
export function withStoredImageDigest<T>(
  storage: Pick<ObjectStorageGateway, 'get'>,
  key: string,
  process: (filename: string) => Promise<T>,
): Promise<{ value: T; sha256: string }> {
  return withDownloadedImage(
    storage,
    key,
    async (filename, sha256) => ({ value: await process(filename), sha256: sha256! }),
    { digest: true },
  );
}
