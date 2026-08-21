#!/usr/bin/env bash
set -euo pipefail

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SEKERCHAT_BACKUP_DIR:-$SCRIPT_DIR/backups/postgres}"
LOG_FILE="${SEKERCHAT_BACKUP_LOG_FILE:-$BACKUP_DIR/backup.log}"
RETENTION_DAYS="${SEKERCHAT_BACKUP_RETENTION_DAYS:-14}"
MIN_UNCOMPRESSED_BYTES="${SEKERCHAT_BACKUP_MIN_BYTES:-1024}"
DOCKER_BIN="${SEKERCHAT_DOCKER_BIN:-/usr/local/bin/docker}"
POSTGRES_CONTAINER="${SEKERCHAT_POSTGRES_CONTAINER:-sekerchat-postgres}"
POSTGRES_USER="${SEKERCHAT_POSTGRES_USER:-}"
POSTGRES_DB="${SEKERCHAT_POSTGRES_DB:-}"

TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_FILE="$BACKUP_DIR/sekerchat-auto-$TIMESTAMP.sql.gz"
PARTIAL_FILE="$BACKUP_FILE.partial"
CHECKSUM_FILE="$BACKUP_FILE.sha256"
CHECKSUM_PARTIAL_FILE="$CHECKSUM_FILE.partial"
LOCK_FILE="$BACKUP_DIR/.postgres-backup.lock"
DOCKER_COMMAND=()

log() {
  local message="$1"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$message" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $1" >&2
  exit 1
}

cleanup() {
  local exit_code=$?

  trap - EXIT
  rm -f "$PARTIAL_FILE" "$CHECKSUM_PARTIAL_FILE"
  exit "$exit_code"
}

handle_signal() {
  exit "$1"
}

require_non_negative_integer() {
  local name="$1"
  local value="$2"

  case "$value" in
    ''|*[!0-9]*) fail "$name must be a non-negative integer, got '$value'" ;;
  esac
}

select_docker_command() {
  if [ ! -x "$DOCKER_BIN" ]; then
    fail "Docker executable is not available at $DOCKER_BIN"
  fi

  if "$DOCKER_BIN" inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    DOCKER_COMMAND=("$DOCKER_BIN")
    return
  fi

  if command -v sudo >/dev/null 2>&1 \
    && sudo -n "$DOCKER_BIN" inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1; then
    DOCKER_COMMAND=(sudo -n "$DOCKER_BIN")
    return
  fi

  fail "Cannot inspect $POSTGRES_CONTAINER; run the task as root or grant passwordless access to $DOCKER_BIN"
}

resolve_postgres_identity() {
  if [ -z "$POSTGRES_USER" ]; then
    POSTGRES_USER="$(
      "${DOCKER_COMMAND[@]}" exec "$POSTGRES_CONTAINER" printenv POSTGRES_USER
    )" || fail "Cannot read POSTGRES_USER from $POSTGRES_CONTAINER"
  fi
  if [ -z "$POSTGRES_DB" ]; then
    POSTGRES_DB="$(
      "${DOCKER_COMMAND[@]}" exec "$POSTGRES_CONTAINER" printenv POSTGRES_DB
    )" || fail "Cannot read POSTGRES_DB from $POSTGRES_CONTAINER"
  fi
  if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_DB" ]; then
    fail "PostgreSQL container identity is incomplete"
  fi
}

verify_backup() {
  local file="$1"
  local trailer
  local uncompressed_bytes

  gzip -t "$file" || fail "gzip integrity check failed"
  uncompressed_bytes="$(gzip -cd "$file" | wc -c | tr -d ' ')"
  if [ "$uncompressed_bytes" -lt "$MIN_UNCOMPRESSED_BYTES" ]; then
    fail "Backup payload is unexpectedly small: $uncompressed_bytes bytes"
  fi

  trailer="$(gzip -cd "$file" | tail -n 20)"
  if ! grep -Fq -- '-- PostgreSQL database dump complete' <<<"$trailer"; then
    fail "PostgreSQL completion marker is missing"
  fi

  printf '%s' "$uncompressed_bytes"
}

delete_expired_backups() {
  local expired_file
  local deleted_count=0

  while IFS= read -r expired_file; do
    [ -n "$expired_file" ] || continue
    rm -f "$expired_file" "$expired_file.sha256"
    deleted_count=$((deleted_count + 1))
  done < <(
    find "$BACKUP_DIR" -maxdepth 1 -type f \
      -name 'sekerchat-auto-*.sql.gz' \
      -mtime "+$RETENTION_DAYS" \
      -print
  )

  if [ "$deleted_count" -gt 0 ]; then
    log "Removed $deleted_count automatic backup(s) older than $RETENTION_DAYS days"
  fi
}

main() {
  local uncompressed_bytes
  local compressed_bytes
  local checksum

  mkdir -p "$BACKUP_DIR"
  touch "$LOG_FILE"
  trap cleanup EXIT
  trap 'handle_signal 129' HUP
  trap 'handle_signal 130' INT
  trap 'handle_signal 143' TERM

  require_non_negative_integer SEKERCHAT_BACKUP_RETENTION_DAYS "$RETENTION_DAYS"
  require_non_negative_integer SEKERCHAT_BACKUP_MIN_BYTES "$MIN_UNCOMPRESSED_BYTES"

  if ! command -v flock >/dev/null 2>&1; then
    fail "flock is required to prevent overlapping backups"
  fi
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    fail "Another PostgreSQL backup is already running (lock: $LOCK_FILE)"
  fi

  select_docker_command
  resolve_postgres_identity
  log "Starting PostgreSQL backup for $POSTGRES_CONTAINER/$POSTGRES_DB"

  if ! "${DOCKER_COMMAND[@]}" exec "$POSTGRES_CONTAINER" \
    pg_dump \
      --username "$POSTGRES_USER" \
      --dbname "$POSTGRES_DB" \
      --no-owner \
      --no-acl \
      2>>"$LOG_FILE" \
    | gzip -c >"$PARTIAL_FILE"; then
    fail "pg_dump failed; incomplete output was removed"
  fi

  uncompressed_bytes="$(verify_backup "$PARTIAL_FILE")"
  compressed_bytes="$(wc -c <"$PARTIAL_FILE" | tr -d ' ')"
  checksum="$(sha256sum "$PARTIAL_FILE" | awk '{print $1}')"

  printf '%s  %s\n' "$checksum" "$(basename "$BACKUP_FILE")" >"$CHECKSUM_PARTIAL_FILE"
  mv "$PARTIAL_FILE" "$BACKUP_FILE"
  mv "$CHECKSUM_PARTIAL_FILE" "$CHECKSUM_FILE"

  log "Backup completed: $BACKUP_FILE (compressed=$compressed_bytes, uncompressed=$uncompressed_bytes, sha256=$checksum)"
  delete_expired_backups
}

main "$@"
