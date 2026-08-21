#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_BIN="${SEKERCHAT_DOCKER_BIN:-/usr/local/bin/docker}"
COMPOSE_BIN="${SEKERCHAT_COMPOSE_BIN:-}"
COMPOSE_FILE="${SEKERCHAT_COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.yml}"
ENV_FILE="${SEKERCHAT_ENV_FILE:-$SCRIPT_DIR/.env}"
BACKUP_SCRIPT="${SEKERCHAT_BACKUP_SCRIPT:-$SCRIPT_DIR/backup.sh}"
READINESS_ATTEMPTS="${SEKERCHAT_READINESS_ATTEMPTS:-30}"
PREVIOUS_BACKEND_IMAGE="$($DOCKER_BIN inspect sekerchat-backend --format '{{.Config.Image}}' 2>/dev/null || true)"
PREVIOUS_FRONTEND_IMAGE="$($DOCKER_BIN inspect sekerchat-frontend --format '{{.Config.Image}}' 2>/dev/null || true)"
source "$SCRIPT_DIR/app-release-lib.sh"

if [ -z "${APP_IMAGE_TAG:-}" ]; then
  APP_IMAGE_TAG="$(sed -n 's/^APP_IMAGE_TAG=//p' "$ENV_FILE" | tail -n 1)"
  export APP_IMAGE_TAG
fi
if [ -z "$APP_IMAGE_TAG" ]; then
  printf 'ERROR: APP_IMAGE_TAG is required.\n' >&2
  exit 1
fi

SEKERCHAT_DOCKER_BIN="$DOCKER_BIN" \
SEKERCHAT_COMPOSE_BIN="$COMPOSE_BIN" \
SEKERCHAT_COMPOSE_FILE="$COMPOSE_FILE" \
SEKERCHAT_ENV_FILE="$ENV_FILE" \
  "$SCRIPT_DIR/verify-app-compose.sh"
"$BACKUP_SCRIPT"

# Validate the schema and image before touching migration history. The old
# application remains running throughout preflight and migration.
compose --profile migration run --rm migrate node node_modules/prisma/build/index.js validate --schema prisma/schema.prisma
if ! compose --profile migration run --rm migrate; then
  printf 'ERROR: migration failed; old application is still running and no new app was started.\n' >&2
  exit 1
fi

if ! deploy_service_tag backend "$APP_IMAGE_TAG" || ! wait_for_backend; then
  if restore_backend "$PREVIOUS_BACKEND_IMAGE"; then
    printf 'ERROR: new backend was unhealthy; the previous backend image was restored and verified.\n' >&2
  else
    printf 'ERROR: new backend was unhealthy and automatic backend restoration failed.\n' >&2
  fi
  exit 1
fi

if ! deploy_service_tag frontend "$APP_IMAGE_TAG" || ! wait_for_frontend; then
  if restore_application "$PREVIOUS_BACKEND_IMAGE" "$PREVIOUS_FRONTEND_IMAGE"; then
    printf 'ERROR: new frontend was unhealthy; both previous application images were restored and verified.\n' >&2
  else
    printf 'ERROR: new frontend was unhealthy and automatic application restoration failed.\n' >&2
  fi
  exit 1
fi

"$DOCKER_BIN" image inspect "sekerchat-backend:$APP_IMAGE_TAG" --format 'backend_repo_digests={{json .RepoDigests}} image_id={{.Id}}'
"$DOCKER_BIN" image inspect "sekerchat-frontend:$APP_IMAGE_TAG" --format 'frontend_repo_digests={{json .RepoDigests}} image_id={{.Id}}'
printf 'Release %s completed.\n' "$APP_IMAGE_TAG"
