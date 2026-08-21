import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appCompose = read('deploy/synology/docker-compose.yml');
const maintenanceCompose = read('deploy/synology/maintenance/docker-compose.yml');
const dockerfile = read('apps/backend/Dockerfile');
const releaseScript = read('deploy/synology/release.sh');
const rollbackScript = read('deploy/synology/rollback-app.sh');

assert.deepEqual(
  composeServices(appCompose).sort(),
  ['backend', 'frontend', 'migrate'],
  'The production compose must remain app-only.',
);
assert.deepEqual(
  composeServices(maintenanceCompose).sort(),
  ['minio', 'postgres'],
  'Data services must remain isolated in the maintenance compose.',
);
assert.doesNotMatch(
  dockerfile,
  /CMD[^\n]*prisma[^\n]*migrate/i,
  'The backend container must never run migrations during startup.',
);
for (const requiredCopy of [
  'COPY packages/contracts/package.json packages/contracts/package.json',
  'COPY packages/contracts packages/contracts',
  'COPY --from=builder /app/packages/contracts ./packages/contracts',
]) {
  assert.match(
    dockerfile,
    new RegExp(requiredCopy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    `The backend image must include the contracts workspace: ${requiredCopy}`,
  );
}
assertOrdered(releaseScript, [
  '"$BACKUP_SCRIPT"',
  'validate --schema prisma/schema.prisma',
  'if ! compose --profile migration run --rm migrate; then',
  'deploy_service_tag backend',
  'wait_for_backend',
  'deploy_service_tag frontend',
  'wait_for_frontend',
]);
assert.doesNotMatch(
  rollbackScript,
  /\b(postgres|minio|migrate)\b/i,
  'Application rollback must not address data services or run migrations.',
);

for (const path of [
  'deploy/synology/release.sh',
  'deploy/synology/rollback-app.sh',
  'deploy/synology/verify-app-compose.sh',
]) {
  assert.ok(statSync(resolve(root, path)).mode & 0o111, `${path} must be executable.`);
}

const releaseVersion = JSON.parse(read('package.json')).version;
for (const path of [
  'apps/backend/package.json',
  'apps/frontend-react/package.json',
  'apps/reminder/package.json',
  'packages/contracts/package.json',
  'packages/shared/package.json',
]) {
  assert.equal(
    JSON.parse(read(path)).version,
    releaseVersion,
    `${path} must use the release version ${releaseVersion}.`,
  );
}

console.log('Deployment boundaries and release version are consistent.');

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

function composeServices(source) {
  const services = [];
  let inServices = false;
  for (const line of source.split('\n')) {
    if (line === 'services:') {
      inServices = true;
      continue;
    }
    if (inServices && /^\S/.test(line)) break;
    const match = /^ {2}([a-zA-Z0-9_-]+):\s*$/.exec(line);
    if (inServices && match) services.push(match[1]);
  }
  return services;
}

function assertOrdered(source, markers) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(index > previousIndex, `Release step is missing or out of order: ${marker}`);
    previousIndex = index;
  }
}
