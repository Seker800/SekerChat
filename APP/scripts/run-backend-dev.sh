#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$APP_ROOT/apps/backend"
ENV_FILE="$BACKEND_DIR/.env.development.local"

if [ ! -f "$ENV_FILE" ] || [ ! -r "$ENV_FILE" ]; then
  echo "Missing or unreadable backend dev env file: $ENV_FILE" >&2
  exit 1
fi

cd "$BACKEND_DIR"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

exec npm run start:dev
