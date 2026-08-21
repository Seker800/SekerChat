#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CURRENT_SCRIPT="$SCRIPT_DIR/../../APP/deploy/synology/backup.sh"

if [ ! -f "$CURRENT_SCRIPT" ]; then
  printf 'Current backup script is missing: %s\n' "$CURRENT_SCRIPT" >&2
  exit 1
fi

exec bash "$CURRENT_SCRIPT" "$@"
