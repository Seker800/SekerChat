import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();

const runtimePaths = [
  'apps/backend/src/eagle',
  'apps/backend/src/integrations/eagle-app-import',
  'apps/backend/src/integrations/eagle-upload',
  'apps/frontend-react/src/components/eagle',
  'deploy/eagle-test',
  'plugins/seker-eagle-importer',
];

test('SekerChat does not ship SekerEagle runtime modules', () => {
  const remainingPaths = runtimePaths.filter((relativePath) =>
    hasFiles(path.join(appRoot, relativePath)),
  );

  assert.deepEqual(remainingPaths, []);
});

test('SekerChat composition roots and production Compose do not start SekerEagle', () => {
  const appModule = read('apps/backend/src/app.module.ts');
  const authenticatedApp = read('apps/frontend-react/src/auth/AuthenticatedApp.tsx');
  const compose = read('deploy/synology/docker-compose.yml');

  assert.doesNotMatch(appModule, /eagle/i);
  assert.doesNotMatch(authenticatedApp, /eagle/i);
  assert.doesNotMatch(compose, /eagle-worker|sekerchat-eagle/i);
});

test('current data and permission contracts do not expose SekerEagle', () => {
  const schema = read('apps/backend/prisma/schema.prisma');
  const permissions = read('packages/shared/src/permissions.ts');

  assert.doesNotMatch(schema, /\bEAGLE_ASSET\b|\b(?:model|enum) Eagle\w+/);
  assert.doesNotMatch(permissions, /access_seker_eagle/i);
});

test('root scripts no longer expose SekerEagle development or test entrypoints', () => {
  const packageJson = JSON.parse(read('package.json'));
  const eagleScripts = Object.keys(packageJson.scripts ?? {}).filter((name) => /eagle/i.test(name));

  assert.deepEqual(eagleScripts, []);
});

function read(relativePath) {
  return readFileSync(path.join(appRoot, relativePath), 'utf8');
}

function hasFiles(directory) {
  if (!existsSync(directory)) return false;
  return readdirSync(directory, { withFileTypes: true }).some(
    (entry) =>
      entry.isFile() || (entry.isDirectory() && hasFiles(path.join(directory, entry.name))),
  );
}
