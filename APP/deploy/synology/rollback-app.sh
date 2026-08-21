#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_BIN="${SEKERCHAT_DOCKER_BIN:-/usr/local/bin/docker}"
COMPOSE_BIN="${SEKERCHAT_COMPOSE_BIN:-}"
COMPOSE_FILE="${SEKERCHAT_COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.yml}"
ENV_FILE="${SEKERCHAT_ENV_FILE:-$SCRIPT_DIR/.env}"
READINESS_ATTEMPTS="${SEKERCHAT_READINESS_ATTEMPTS:-30}"
PREVIOUS_BACKEND_IMAGE="$($DOCKER_BIN inspect sekerchat-backend --format '{{.Config.Image}}' 2>/dev/null || true)"
PREVIOUS_FRONTEND_IMAGE="$($DOCKER_BIN inspect sekerchat-frontend --format '{{.Config.Image}}' 2>/dev/null || true)"
source "$SCRIPT_DIR/app-release-lib.sh"

if [ -z "${APP_ROLLBACK_TAG:-}" ]; then
  printf 'ERROR: APP_ROLLBACK_TAG is required.\n' >&2
  exit 1
fi

export APP_IMAGE_TAG="$APP_ROLLBACK_TAG"
SEKERCHAT_DOCKER_BIN="$DOCKER_BIN" \
SEKERCHAT_COMPOSE_BIN="$COMPOSE_BIN" \
SEKERCHAT_COMPOSE_FILE="$COMPOSE_FILE" \
SEKERCHAT_ENV_FILE="$ENV_FILE" \
  "$SCRIPT_DIR/verify-app-compose.sh"
if ! deploy_service_tag backend "$APP_ROLLBACK_TAG" || ! wait_for_backend; then
  if restore_backend "$PREVIOUS_BACKEND_IMAGE"; then
    printf 'ERROR: rollback backend was unhealthy; the previous backend was restored and verified.\n' >&2
  else
    printf 'ERROR: rollback backend was unhealthy and automatic restoration failed.\n' >&2
  fi
  exit 1
fi

if ! deploy_service_tag frontend "$APP_ROLLBACK_TAG" || ! wait_for_frontend; then
  if restore_application "$PREVIOUS_BACKEND_IMAGE" "$PREVIOUS_FRONTEND_IMAGE"; then
    printf 'ERROR: rollback frontend was unhealthy; the previous application was restored and verified.\n' >&2
  else
    printf 'ERROR: rollback frontend was unhealthy and automatic application restoration failed.\n' >&2
  fi
  exit 1
fi

printf 'Application rolled back to %s. Database and object storage were not changed.\n' "$APP_ROLLBACK_TAG"
