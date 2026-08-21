#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"
CORS_FILE="${CORS_FILE:-$SCRIPT_DIR/cors.xml}"
DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
MINIO_CONTAINER="${MINIO_CONTAINER:-sekerchat-minio}"
MINIO_ALIAS="${MINIO_ALIAS:-sekerchat-minio-local}"

if [ ! -r "$ENV_FILE" ]; then
  echo "Missing or unreadable env file: $ENV_FILE" >&2
  exit 1
fi

if [ ! -r "$CORS_FILE" ]; then
  echo "Missing or unreadable CORS file: $CORS_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"

if ! "$DOCKER_BIN" ps --format '{{.Names}}' | grep -qx "$MINIO_CONTAINER"; then
  echo "MinIO container is not running: $MINIO_CONTAINER" >&2
  exit 1
fi

"$DOCKER_BIN" exec -i "$MINIO_CONTAINER" sh -c 'cat > /tmp/sekerchat-cors.xml' < "$CORS_FILE"

"$DOCKER_BIN" exec "$MINIO_CONTAINER" sh -c '
set -eu
ALIAS="$1"
ROOT_USER="$2"
ROOT_PASSWORD="$3"
BUCKET="$4"
CORS_FILE="/tmp/sekerchat-cors.xml"

mc alias set "$ALIAS" http://127.0.0.1:9000 "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null
mc mb --ignore-existing "$ALIAS/$BUCKET" >/dev/null
mc cors set "$ALIAS/$BUCKET" "$CORS_FILE"
mc cors info "$ALIAS/$BUCKET"
rm -f "$CORS_FILE"
' sh "$MINIO_ALIAS" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" "$S3_BUCKET"

echo "Applied MinIO CORS for bucket: $S3_BUCKET"
