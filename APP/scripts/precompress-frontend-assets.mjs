import { createGzip } from 'node:zlib';
import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';

const root = resolve(process.argv[2] ?? 'apps/frontend-react/dist');
const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
const minimumBytes = 1024;

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return visit(path);
    if (!entry.isFile() || !compressibleExtensions.has(extname(entry.name))) return;
    const metadata = await stat(path);
    if (metadata.size < minimumBytes) return;

    const output = `${path}.gz`;
    await pipeline(createReadStream(path), createGzip({ level: 9 }), createWriteStream(output));
    const compressed = await stat(output);
    if (compressed.size >= metadata.size) await unlink(output);
  }));
}

await visit(root);
