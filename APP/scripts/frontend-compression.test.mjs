import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('frontend compression creates reusable gzip assets and nginx serves them', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'sekerchat-compression-'));
  const source = join(fixture, 'workspace-example.js');
  writeFileSync(source, 'const message = "hello";\n'.repeat(200));

  const result = spawnSync(
    process.execPath,
    [resolve(appRoot, 'scripts/precompress-frontend-assets.mjs'), fixture],
    { cwd: appRoot, encoding: 'utf8' },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(gunzipSync(readFileSync(`${source}.gz`)).toString(), readFileSync(source, 'utf8'));

  const nginx = readFileSync(resolve(appRoot, 'apps/frontend-react/nginx.conf.template'), 'utf8');
  assert.match(nginx, /gzip_static\s+on;/);
  assert.match(nginx, /gzip_vary\s+on;/);
});
