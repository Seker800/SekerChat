#!/usr/bin/env bash
set -euo pipefail
umask 077
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MC_BIN="${SEKERCHAT_MC_BIN:-mc}"
PYTHON_BIN="${SEKERCHAT_PYTHON_BIN:-python3}"
SOURCE="${SEKERCHAT_OBJECT_BACKUP_SOURCE:?Set a preconfigured mc alias/bucket}"
BACKUP_DIR="${SEKERCHAT_OBJECT_BACKUP_DIR:?Set an independent absolute backup destination}"
[[ "$BACKUP_DIR" == /* && "$BACKUP_DIR" != / ]] || { printf '%s\n' 'Backup destination must be an absolute dedicated directory.' >&2; exit 1; }
command -v "$MC_BIN" >/dev/null
command -v "$PYTHON_BIN" >/dev/null
mkdir -p -- "$BACKUP_DIR"
mkdir -- "$BACKUP_DIR/.object-backup.lock" || { printf '%s\n' 'Another object backup is running; inspect a stale lock after a crash.' >&2; exit 1; }
trap 'rmdir -- "$BACKUP_DIR/.object-backup.lock"' EXIT
NAME="objects-$(date -u +%Y%m%dT%H%M%SZ)-$$"
PARTIAL="$BACKUP_DIR/$NAME.partial"
mkdir -p -- "$PARTIAL/objects"
"$MC_BIN" ls --recursive --json "$SOURCE" > "$PARTIAL/source-manifest.jsonl"
"$MC_BIN" mirror --quiet --overwrite "$SOURCE" "$PARTIAL/objects"
"$PYTHON_BIN" "$SCRIPT_DIR/verify-object-backup.py" capture "$PARTIAL"
"$PYTHON_BIN" "$SCRIPT_DIR/verify-object-backup.py" verify "$PARTIAL"
printf '%s\n' 'Object backup verified.' > "$PARTIAL/COMPLETE"
mv -- "$PARTIAL" "$BACKUP_DIR/$NAME"
printf '%s\n' 'Object backup completed and checksums verified.'
