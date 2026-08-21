import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, '..');
const sourceDir = resolve(appDir, 'src', 'desktop');
const targetDir = resolve(appDir, 'dist', 'desktop');

await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true });
