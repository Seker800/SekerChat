import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const exporter = resolve(appRoot, 'scripts/create-public-repository.sh');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

test('public repository exporter creates one scanned commit without source history', () => {
  assert.equal(existsSync(exporter), true, 'public repository exporter is required');
  if (!existsSync(exporter)) return;

  const fixture = mkdtempSync(join(tmpdir(), 'sekerchat-public-export-'));
  const source = join(fixture, 'source');
  const destination = join(fixture, 'public');
  const fakeBin = join(fixture, 'bin');
  const gitleaksCalls = join(fixture, 'gitleaks-calls.txt');
  mkdirSync(source);
  mkdirSync(fakeBin);

  git(source, 'init', '-b', 'main');
  git(source, 'config', 'core.autocrlf', 'false');
  git(source, 'config', 'user.name', 'Fixture');
  git(source, 'config', 'user.email', 'fixture@example.com');
  writeFileSync(join(source, 'LICENSE'), 'fixture license\n');
  writeFileSync(join(source, 'script.sh'), '#!/bin/sh\n');
  chmodSync(join(source, 'script.sh'), 0o755);
  writeFileSync(join(source, 'removed-secret.txt'), 'historical-secret\n');
  git(source, 'add', '.');
  git(source, 'update-index', '--chmod=+x', 'script.sh');
  git(source, 'commit', '-m', 'secret history');
  rmSync(join(source, 'removed-secret.txt'));
  writeFileSync(join(source, 'current.txt'), 'public content\n');
  git(source, 'add', '-A');
  git(source, 'commit', '-m', 'current tree');

  const fakeGitleaks = join(fakeBin, 'gitleaks');
  writeFileSync(fakeGitleaks, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GITLEAKS_CALLS"\n');
  chmodSync(fakeGitleaks, 0o755);

  const result = spawnSync('bash', [exporter, source, destination], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH}`,
      GITLEAKS_CALLS: gitleaksCalls,
    },
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(git(destination, 'rev-list', '--count', 'HEAD').trim(), '1');
  assert.equal(readFileSync(join(destination, 'current.txt'), 'utf8'), 'public content\n');
  assert.equal(existsSync(join(destination, 'removed-secret.txt')), false);
  assert.match(git(destination, 'ls-files', '--stage', 'script.sh'), /^100755 /);
  assert.doesNotMatch(git(destination, 'log', '-p', '--all'), /historical-secret/);

  const scanCalls = readFileSync(gitleaksCalls, 'utf8');
  assert.match(scanCalls, /^dir /m);
  assert.match(scanCalls, /^git /m);
});
