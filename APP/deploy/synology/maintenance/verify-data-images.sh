#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SEKERCHAT_ENV_FILE:-$SCRIPT_DIR/../.env}"

read_image() {
  local wanted="$1" key value
  if [[ -f "$ENV_FILE" ]]; then
    while IFS='=' read -r key value || [[ -n "${key:-}" ]]; do
      [[ "$key" == "$wanted" ]] || continue
      value="${value%$'\r'}"
      value="${value#\"}"; value="${value%\"}"
      value="${value#\'}"; value="${value%\'}"
      printf '%s' "$value"
    done < "$ENV_FILE"
  fi
}
for name in POSTGRES_IMAGE MINIO_IMAGE; do
  value="${!name:-}"
  [[ -n "$value" ]] || value="$(read_image "$name")"
  if [[ ! "$value" =~ ^[a-zA-Z0-9][a-zA-Z0-9._/:-]*@sha256:[a-f0-9]{64}$ ]]; then
    printf '%s must identify the deployed data image by sha256 digest.\n' "$name" >&2
    exit 1
  fi
done
printf '%s\n' 'Data images are pinned by digest.'
