#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env}"
DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
MINIO_CONTAINER="${MINIO_CONTAINER:-sekerchat-minio}"
MINIO_ALIAS="${MINIO_ALIAS:-sekerchat-policy-local}"
POLICY_NAME="${MINIO_APP_POLICY_NAME:-sekerchat-app-policy}"

if [ ! -r "$ENV_FILE" ]; then
  echo "Missing or unreadable env file: $ENV_FILE" >&2
  exit 1
fi

read_env_value() {
  local key="$1"
  local value

  value="$(
    awk -v target="$key" '
      {
        line = $0
        sub(/^[[:space:]]*export[[:space:]]+/, "", line)
        prefix = target "="
        if (index(line, prefix) == 1) {
          value = substr(line, length(prefix) + 1)
          sub(/\r$/, "", value)
          found = 1
        }
      }
      END { if (found) print value }
    ' "$ENV_FILE"
  )"

  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac
  printf '%s' "$value"
}

MINIO_ROOT_USER="$(read_env_value MINIO_ROOT_USER)"
MINIO_ROOT_PASSWORD="$(read_env_value MINIO_ROOT_PASSWORD)"
S3_BUCKET="$(read_env_value S3_BUCKET)"
S3_ACCESS_KEY_ID="$(read_env_value S3_ACCESS_KEY_ID)"

: "${MINIO_ROOT_USER:?MINIO_ROOT_USER is required}"
: "${MINIO_ROOT_PASSWORD:?MINIO_ROOT_PASSWORD is required}"
: "${S3_BUCKET:?S3_BUCKET is required}"
: "${S3_ACCESS_KEY_ID:?S3_ACCESS_KEY_ID is required}"

if ! "$DOCKER_BIN" ps --format '{{.Names}}' | grep -qx "$MINIO_CONTAINER"; then
  echo "MinIO container is not running: $MINIO_CONTAINER" >&2
  exit 1
fi

"$DOCKER_BIN" exec -i "$MINIO_CONTAINER" sh -c 'cat > /tmp/sekerchat-app-policy.json' <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET"]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListMultipartUploadParts", "s3:AbortMultipartUpload"],
      "Resource": ["arn:aws:s3:::$S3_BUCKET/*"]
    }
  ]
}
EOF

"$DOCKER_BIN" exec "$MINIO_CONTAINER" sh -c '
set -eu
ALIAS="$1"
ROOT_USER="$2"
ROOT_PASSWORD="$3"
POLICY_NAME="$4"
APP_USER="$5"
POLICY_FILE="/tmp/sekerchat-app-policy.json"

trap '\''rm -f "$POLICY_FILE"'\'' EXIT
mc alias set "$ALIAS" http://127.0.0.1:9000 "$ROOT_USER" "$ROOT_PASSWORD" >/dev/null
mc admin policy create "$ALIAS" "$POLICY_NAME" "$POLICY_FILE" >/dev/null
mc admin policy attach "$ALIAS" "$POLICY_NAME" --user "$APP_USER" >/dev/null
mc admin policy info "$ALIAS" "$POLICY_NAME"
' sh "$MINIO_ALIAS" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" "$POLICY_NAME" "$S3_ACCESS_KEY_ID"

echo "Applied MinIO application policy '$POLICY_NAME' to the configured application user for bucket '$S3_BUCKET'."
