import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('backup discovers the PostgreSQL user and database from the running container', () => {
  const fixture = createFixture();
  const result = runScript('deploy/synology/backup.sh', {
    APP_IMAGE_TAG: '',
    SEKERCHAT_DOCKER_BIN: fixture.docker,
    SEKERCHAT_BACKUP_DIR: join(fixture.root, 'backups'),
    SEKERCHAT_BACKUP_LOG_FILE: join(fixture.root, 'backups', 'backup.log'),
    SEKERCHAT_BACKUP_MIN_BYTES: '1',
    FAKE_DOCKER_LOG: fixture.log,
    FAKE_FRONTEND_CHECKS: fixture.frontendChecks,
    PATH: fixture.path,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const calls = readFileSync(fixture.log, 'utf8');
  assert.match(calls, /exec sekerchat-postgres printenv POSTGRES_USER/);
  assert.match(calls, /exec sekerchat-postgres printenv POSTGRES_DB/);
  assert.match(calls, /--username sekerchat_app/);
  assert.match(calls, /--dbname sekerchat_prod/);
});

test('MinIO policy update parses Compose env without executing unrelated values', () => {
  const root = mkdtempSync(join(tmpdir(), 'sekerchat-policy-test-'));
  const docker = join(root, 'docker');
  const envFile = join(root, '.env');
  const log = join(root, 'docker.log');
  const sideEffect = join(root, 'must-not-exist');

  writeFileSync(log, '');
  writeFileSync(
    envFile,
    [
      `UNRELATED=$(touch ${sideEffect})`,
      'OIDC_SCOPES=openid profile email',
      'MINIO_ROOT_USER=root-user',
      'MINIO_ROOT_PASSWORD=root-password',
      'S3_BUCKET=sekerchat',
      'S3_ACCESS_KEY_ID=app-user',
      '',
    ].join('\n'),
  );
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >>${JSON.stringify(log)}
if [ "$1" = ps ]; then
  printf '%s\n' sekerchat-minio
  exit 0
fi
if [ "$1" = exec ] && [ "\${2:-}" = -i ]; then
  cat >/dev/null
fi
exit 0
`,
  );
  chmodSync(docker, 0o755);

  const result = runScript('deploy/synology/apply-minio-app-policy.sh', {
    DOCKER_BIN: docker,
    ENV_FILE: envFile,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(existsSync(sideEffect), false, 'Compose env values must never be shell-evaluated');
  assert.match(readFileSync(log, 'utf8'), /app-user/);
  assert.doesNotMatch(result.stdout, /app-user/, 'MinIO access key ids must not be logged');
});

test('release restores and verifies both application services when the new frontend fails', () => {
  const fixture = createFixture();
  const result = runScript('deploy/synology/release.sh', {
    APP_IMAGE_TAG: 'new',
    SEKERCHAT_DOCKER_BIN: fixture.docker,
    SEKERCHAT_COMPOSE_FILE: join(appRoot, 'deploy/synology/docker-compose.yml'),
    SEKERCHAT_ENV_FILE: fixture.envFile,
    SEKERCHAT_BACKUP_SCRIPT: fixture.backup,
    SEKERCHAT_READINESS_ATTEMPTS: '1',
    FAKE_DOCKER_LOG: fixture.log,
    FAKE_FRONTEND_CHECKS: fixture.frontendChecks,
    PATH: fixture.path,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const calls = readFileSync(fixture.log, 'utf8');
  assert.match(calls, /old\|compose[^\n]*up -d --no-deps backend/);
  assert.doesNotMatch(calls, /eagle/i);
  assert.match(calls, /old\|compose[^\n]*up -d --no-deps frontend/);
  assert.equal(Number(readFileSync(fixture.frontendChecks, 'utf8')), 2);
});

test('release supports a standalone Compose binary without changing Docker commands', () => {
  const fixture = createFixture();
  const result = runScript('deploy/synology/release.sh', {
    APP_IMAGE_TAG: 'new',
    SEKERCHAT_DOCKER_BIN: fixture.docker,
    SEKERCHAT_COMPOSE_BIN: fixture.compose,
    SEKERCHAT_COMPOSE_FILE: join(appRoot, 'deploy/synology/docker-compose.yml'),
    SEKERCHAT_ENV_FILE: fixture.envFile,
    SEKERCHAT_BACKUP_SCRIPT: fixture.backup,
    SEKERCHAT_READINESS_ATTEMPTS: '1',
    FAKE_DOCKER_LOG: fixture.log,
    FAKE_FRONTEND_CHECKS: fixture.frontendChecks,
    PATH: fixture.path,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const calls = readFileSync(fixture.log, 'utf8');
  assert.match(calls, /compose\|--env-file[^\n]*config --services/);
  assert.match(calls, /compose\|--env-file[^\n]*up -d --no-deps backend/);
  assert.doesNotMatch(calls, /docker\|compose/);
});

test('release readiness uses the Compose healthcheck instead of optional HTTP tools', () => {
  const fixture = createFixture();
  const result = runScript('deploy/synology/release.sh', {
    APP_IMAGE_TAG: 'new',
    SEKERCHAT_DOCKER_BIN: fixture.docker,
    SEKERCHAT_COMPOSE_BIN: fixture.compose,
    SEKERCHAT_COMPOSE_FILE: join(appRoot, 'deploy/synology/docker-compose.yml'),
    SEKERCHAT_ENV_FILE: fixture.envFile,
    SEKERCHAT_BACKUP_SCRIPT: fixture.backup,
    SEKERCHAT_READINESS_ATTEMPTS: '1',
    FAKE_DOCKER_LOG: fixture.log,
    FAKE_FRONTEND_CHECKS: fixture.frontendChecks,
    PATH: fixture.path,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const calls = readFileSync(fixture.log, 'utf8');
  assert.match(calls, /\|inspect sekerchat-backend --format .*State\.Health\.Status/);
  assert.match(calls, /\|inspect sekerchat-frontend --format .*State\.Health\.Status/);
  assert.doesNotMatch(calls, /\|exec sekerchat-backend/);
  assert.doesNotMatch(calls, /\|exec sekerchat-frontend/);
  assert.doesNotMatch(calls, /\|exec .* wget/);
  assert.doesNotMatch(calls, /\|exec .* curl/);
});

test('manual rollback restores the previous application when the target frontend is unhealthy', () => {
  const fixture = createFixture();
  const result = runScript('deploy/synology/rollback-app.sh', {
    APP_IMAGE_TAG: '',
    APP_ROLLBACK_TAG: 'rollback-target',
    SEKERCHAT_DOCKER_BIN: fixture.docker,
    SEKERCHAT_COMPOSE_FILE: join(appRoot, 'deploy/synology/docker-compose.yml'),
    SEKERCHAT_ENV_FILE: fixture.envFile,
    SEKERCHAT_READINESS_ATTEMPTS: '1',
    FAKE_DOCKER_LOG: fixture.log,
    FAKE_FRONTEND_CHECKS: fixture.frontendChecks,
    PATH: fixture.path,
  });

  assert.equal(result.status, 1, result.stderr || result.stdout);
  const calls = readFileSync(fixture.log, 'utf8');
  assert.match(calls, /old\|compose[^\n]*up -d --no-deps backend/);
  assert.match(calls, /old\|compose[^\n]*up -d --no-deps frontend/);
  assert.equal(Number(readFileSync(fixture.frontendChecks, 'utf8')), 2);
});

function runScript(relativePath, extraEnv) {
  return spawnSync('bash', [resolve(appRoot, relativePath)], {
    cwd: appRoot,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'sekerchat-deploy-test-'));
  const docker = join(root, 'docker');
  const compose = join(root, 'docker-compose');
  const backup = join(root, 'backup');
  const log = join(root, 'docker.log');
  const frontendChecks = join(root, 'frontend-checks');
  const envFile = join(root, '.env');
  const flock = join(root, 'flock');
  writeFileSync(log, '');
  writeFileSync(frontendChecks, '0');
  writeFileSync(envFile, 'APP_IMAGE_TAG=new\n');
  writeFileSync(backup, '#!/usr/bin/env bash\nexit 0\n');
  writeFileSync(flock, '#!/usr/bin/env bash\nexit 0\n');
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
set -eu
printf '%s|%s\\n' "$APP_IMAGE_TAG" "$*" >>"$FAKE_DOCKER_LOG"
if [ "$1" = inspect ]; then
  if [[ "$*" == *"State.Health.Status"* ]]; then
    case "$2" in
      sekerchat-backend) printf '%s\n' 'healthy' ;;
      sekerchat-frontend)
        checks=$(cat "$FAKE_FRONTEND_CHECKS")
        checks=$((checks + 1))
        printf '%s' "$checks" >"$FAKE_FRONTEND_CHECKS"
        if [ "$checks" -ge 2 ]; then printf '%s\n' 'healthy'; else printf '%s\n' 'unhealthy'; fi
        ;;
    esac
    exit 0
  fi
  case "$2" in
    sekerchat-backend) printf '%s\\n' 'sekerchat-backend:old' ;;
    sekerchat-frontend) printf '%s\\n' 'sekerchat-frontend:old' ;;
  esac
  exit 0
fi
case "$*" in
  *"config --services"*) printf '%s\\n' frontend backend migrate; exit 0 ;;
esac
if [ "$1" = exec ] && [ "$3" = printenv ]; then
  case "$4" in
    POSTGRES_USER) printf '%s\\n' 'sekerchat_app' ;;
    POSTGRES_DB) printf '%s\\n' 'sekerchat_prod' ;;
  esac
  exit 0
fi
if [ "$1" = exec ] && [ "$2" = sekerchat-postgres ]; then
  printf '%s\\n' '-- PostgreSQL database dump complete'
  exit 0
fi
exit 0
`,
  );
  writeFileSync(
    compose,
    `#!/usr/bin/env bash
set -eu
printf 'compose|%s\n' "$*" >>"$FAKE_DOCKER_LOG"
case "$*" in
  *"config --services"*) printf '%s\n' frontend backend migrate ;;
esac
exit 0
`,
  );
  chmodSync(docker, 0o755);
  chmodSync(compose, 0o755);
  chmodSync(backup, 0o755);
  chmodSync(flock, 0o755);
  return {
    root,
    docker,
    compose,
    backup,
    log,
    frontendChecks,
    envFile,
    path: `${root}:${process.env.PATH}`,
  };
}
