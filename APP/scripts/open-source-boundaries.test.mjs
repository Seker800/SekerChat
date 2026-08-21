import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '..');

function git(...args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
}

test('public repository excludes private project archives and optional private submodules', () => {
  const trackedFiles = git('ls-files').split('\n').filter(Boolean);
  const stagedEntries = git('ls-files', '--stage');

  assert.equal(
    trackedFiles.some((file) => file.startsWith('过时的文件/')),
    false,
  );
  assert.equal(
    trackedFiles.some((file) => file.startsWith('APP/apps/ui-lab/public/reference/')),
    false,
  );
  assert.doesNotMatch(stagedEntries, /^160000 /m, 'public tree must not depend on gitlinks');
});

test('public source declares one consistent software license', () => {
  assert.match(
    readFileSync(resolve(repoRoot, 'LICENSE'), 'utf8'),
    /GNU AFFERO GENERAL PUBLIC LICENSE/,
  );

  const packageFiles = [
    'APP/package.json',
    'APP/apps/backend/package.json',
    'APP/apps/frontend-react/package.json',
    'APP/apps/mobile-shell/package.json',
    'APP/apps/reminder/package.json',
    'APP/apps/ui-lab/package.json',
    'APP/packages/contracts/package.json',
    'APP/packages/shared/package.json',
  ];
  for (const packageFile of packageFiles) {
    const packageJson = JSON.parse(readFileSync(resolve(repoRoot, packageFile), 'utf8'));
    assert.equal(packageJson.license, 'AGPL-3.0-only', packageFile);
  }
});

test('active tracked source contains no maintainer-specific endpoints or paths', () => {
  const forbiddenPattern = ['yuntai[.]design', '192[.]168[.]31[.]', '/Users/' + 'seker'].join(
    '|',
  );

  let matches = '';
  try {
    matches = git(
      'grep',
      '-n',
      '-I',
      '-E',
      forbiddenPattern,
      '--',
      '.',
      ':(exclude)APP/scripts/open-source-boundaries.test.mjs',
    );
  } catch (error) {
    if (error?.status !== 1) {
      throw error;
    }
  }

  assert.equal(matches, '');
});

test('frontend deployment derives public object-storage CSP from runtime configuration', () => {
  const nginxTemplatePath = resolve(appRoot, 'apps/frontend-react/nginx.conf.template');
  assert.equal(existsSync(nginxTemplatePath), true, 'nginx runtime template is required');
  if (!existsSync(nginxTemplatePath)) return;

  const nginxTemplate = readFileSync(nginxTemplatePath, 'utf8');
  const entrypoint = readFileSync(
    resolve(appRoot, 'apps/frontend-react/docker-entrypoint.sh'),
    'utf8',
  );

  assert.match(nginxTemplate, /\$\{SEKERCHAT_CSP_OBJECT_SOURCE\}/);
  assert.match(entrypoint, /S3_PUBLIC_ENDPOINT/);
  assert.match(entrypoint, /SEKERCHAT_CSP_OBJECT_SOURCE/);
});
