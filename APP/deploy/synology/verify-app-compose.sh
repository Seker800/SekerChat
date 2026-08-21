#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_BIN="${SEKERCHAT_DOCKER_BIN:-/usr/local/bin/docker}"
COMPOSE_BIN="${SEKERCHAT_COMPOSE_BIN:-}"
COMPOSE_FILE="${SEKERCHAT_COMPOSE_FILE:-$SCRIPT_DIR/docker-compose.yml}"
ENV_FILE="${SEKERCHAT_ENV_FILE:-$SCRIPT_DIR/.env}"

if [ -n "$COMPOSE_BIN" ]; then
  services="$("$COMPOSE_BIN" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile migration config --services)"
else
  services="$($DOCKER_BIN compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" --profile migration config --services)"
fi
for forbidden in postgres minio minio-init; do
  if grep -Fxq "$forbidden" <<<"$services"; then
    printf 'ERROR: production app compose unexpectedly contains %s\n' "$forbidden" >&2
    exit 1
  fi
done

for required in frontend backend migrate; do
  if ! grep -Fxq "$required" <<<"$services"; then
    printf 'ERROR: production app compose is missing %s\n' "$required" >&2
    exit 1
  fi
done

printf 'App-only compose verified: %s\n' "$(tr '\n' ' ' <<<"$services")"
