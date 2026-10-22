import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('data image preflight rejects floating references and never evaluates env content', () => {
  const root = mkdtempSync(join(tmpdir(), 'sekerchat-image-check-'));
  const env = join(root, '.env');
  writeFileSync(env, 'POSTGRES_IMAGE=postgres:16-alpine\nMINIO_IMAGE=minio/minio\nUNRELATED=$(false)\n');
  const run = () => spawnSync('bash', ['deploy/synology/maintenance/verify-data-images.sh'], { env: { ...process.env, SEKERCHAT_ENV_FILE: env }, encoding: 'utf8' });
  assert.equal(run().status, 1);
  writeFileSync(env, `POSTGRES_IMAGE=postgres:16-alpine@sha256:${'a'.repeat(64)}\nMINIO_IMAGE=minio/minio@sha256:${'b'.repeat(64)}\nUNRELATED=$(false)\n`);
  assert.equal(run().status, 0);
});

test('object backups remain partial on failure and verify restores against stored checksums', () => {
  const root = mkdtempSync(join(tmpdir(), 'sekerchat-object-backup-'));
  const mc = join(root, 'mc');
  writeFileSync(mc, `#!/usr/bin/env bash
set -eu
if [[ "$1" == ls ]]; then printf '%s\\n' '{"status":"success","type":"file","key":"object.bin","size":4}'; exit 0; fi
if [[ "\${FAIL_COPY:-}" == 1 ]]; then exit 1; fi
mkdir -p -- "\${@: -1}"; printf data > "\${@: -1}/object.bin"
`);
  chmodSync(mc, 0o755);
  const env = { ...process.env, SEKERCHAT_MC_BIN: mc, SEKERCHAT_OBJECT_BACKUP_SOURCE: 'local/bucket', SEKERCHAT_OBJECT_BACKUP_DIR: join(root, 'backups') };
  const success = spawnSync('bash', ['deploy/synology/backup-objects.sh'], { env, encoding: 'utf8' });
  assert.equal(success.status, 0, success.stderr);
  const name = readdirSync(env.SEKERCHAT_OBJECT_BACKUP_DIR).find((entry) => !entry.endsWith('.partial'));
  const backup = join(env.SEKERCHAT_OBJECT_BACKUP_DIR, name);
  assert.equal(JSON.parse(readFileSync(join(backup, 'sha256.json'))).length, 1);
  writeFileSync(join(backup, 'objects/object.bin'), 'bad!');
  const verify = spawnSync('python3', ['deploy/synology/verify-object-backup.py', 'verify', backup], { encoding: 'utf8' });
  assert.notEqual(verify.status, 0);
  assert.equal(spawnSync('bash', ['deploy/synology/backup-objects.sh'], { env: { ...env, FAIL_COPY: '1' }, encoding: 'utf8' }).status, 1);
  const partial = readdirSync(env.SEKERCHAT_OBJECT_BACKUP_DIR).filter((entry) => entry.endsWith('.partial'));
  assert.equal(partial.length, 1);
  assert(!readdirSync(join(env.SEKERCHAT_OBJECT_BACKUP_DIR, partial[0])).includes('COMPLETE'));
});
