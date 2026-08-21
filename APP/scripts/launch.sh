#!/bin/bash
# Usage: launch.sh <backend|frontend>
set -euo pipefail

NPM=${NPM:-npm}
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

case "${1:-}" in
  backend)
    PORT=3100
    NPM_CMD="dev:backend"
    ;;
  frontend)
    PORT=5173
    NPM_CMD="dev:frontend"
    ;;
  *)
    echo "Usage: $0 <backend|frontend>" >&2
    exit 1
    ;;
esac

is_sekerchat_on_port() {
  local pid
  pid=$(lsof -nP -iTCP:$PORT -sTCP:LISTEN -t 2>/dev/null)
  [ -z "$pid" ] && return 1
  ps -p "$pid" -o command= 2>/dev/null | grep -qF "$PROJECT_DIR/"
}

cd "$PROJECT_DIR"

if is_sekerchat_on_port; then
  while is_sekerchat_on_port; do
    sleep 30
  done
fi

# Port is either free or held by a foreign process — try to start.
# If npm fails because port is still taken, exit non-zero so KeepAlive retries.
exec "$NPM" run "$NPM_CMD"
