#!/usr/bin/env bash
set -euo pipefail

umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONITOR_DIR="${SEKERCHAT_MONITOR_DIR:-$SCRIPT_DIR/monitoring}"
DATA_DIR="$MONITOR_DIR/data"
LOG_DIR="$MONITOR_DIR/logs"
PID_FILE="$MONITOR_DIR/memory-monitor.pid"
LOCK_DIR="$MONITOR_DIR/.memory-monitor.lock"
LOG_FILE="$LOG_DIR/memory-monitor.log"
DOCKER_BIN="${SEKERCHAT_DOCKER_BIN:-/usr/local/bin/docker}"
PROC_MEMINFO="${SEKERCHAT_PROC_MEMINFO:-/proc/meminfo}"
PROC_VMSTAT="${SEKERCHAT_PROC_VMSTAT:-/proc/vmstat}"
INTERVAL_SECONDS="${SEKERCHAT_MONITOR_INTERVAL_SECONDS:-60}"
DURATION_HOURS="${SEKERCHAT_MONITOR_DURATION_HOURS:-48}"
BACKEND_CONTAINER="${SEKERCHAT_BACKEND_CONTAINER:-sekerchat-backend}"
POSTGRES_CONTAINER="${SEKERCHAT_POSTGRES_CONTAINER:-sekerchat-postgres}"
MINIO_CONTAINER="${SEKERCHAT_MINIO_CONTAINER:-sekerchat-minio}"
DOCKER_COMMAND=()

CSV_HEADER='timestamp_epoch,timestamp_iso,host_mem_available_kib,host_swap_used_kib,host_pswpin_pages,host_pswpout_pages,backend_exists,backend_mem_bytes,backend_limit_bytes,backend_rss_kib,backend_swap_kib,backend_hwm_kib,backend_restart_count,backend_oom_killed,backend_health,postgres_mem_bytes,minio_mem_bytes'

log() {
  mkdir -p "$LOG_DIR"
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG_FILE"
}

fail() {
  log "ERROR: $1" >&2
  exit 1
}

require_positive_integer() {
  local name="$1"
  local value="$2"
  case "$value" in
    ''|*[!0-9]*) fail "$name must be a positive integer, got '$value'" ;;
  esac
  [ "$value" -gt 0 ] || fail "$name must be greater than zero"
}

select_docker_command() {
  [ -x "$DOCKER_BIN" ] || fail "Docker executable is not available at $DOCKER_BIN"
  if "$DOCKER_BIN" inspect "$BACKEND_CONTAINER" >/dev/null 2>&1; then
    DOCKER_COMMAND=("$DOCKER_BIN")
    return
  fi
  if command -v sudo >/dev/null 2>&1 \
    && sudo -n "$DOCKER_BIN" inspect "$BACKEND_CONTAINER" >/dev/null 2>&1; then
    DOCKER_COMMAND=(sudo -n "$DOCKER_BIN")
    return
  fi
  fail "Cannot inspect $BACKEND_CONTAINER; run as root or grant passwordless Docker access"
}

container_exists() {
  "${DOCKER_COMMAND[@]}" inspect "$1" >/dev/null 2>&1
}

inspect_value() {
  local container="$1"
  local format="$2"
  local fallback="$3"
  local value
  value="$("${DOCKER_COMMAND[@]}" inspect "$container" --format "$format" 2>/dev/null || true)"
  printf '%s' "${value:-$fallback}"
}

size_to_bytes() {
  local raw="${1:-0}"
  awk -v value="$raw" 'BEGIN {
    if (value == "" || value == "0") { print 0; exit }
    number = value + 0
    unit = value
    sub(/^[0-9.]+/, "", unit)
    multiplier = 1
    if (unit == "kB" || unit == "KB") multiplier = 1000
    else if (unit == "KiB") multiplier = 1024
    else if (unit == "MB") multiplier = 1000000
    else if (unit == "MiB") multiplier = 1048576
    else if (unit == "GB") multiplier = 1000000000
    else if (unit == "GiB") multiplier = 1073741824
    printf "%.0f\n", number * multiplier
  }'
}

proc_value() {
  local file="$1"
  local key="$2"
  awk -v key="$key" '$1 == key ":" { print $2; found=1; exit } END { if (!found) print 0 }' "$file"
}

vmstat_value() {
  local key="$1"
  awk -v key="$key" '$1 == key { print $2; found=1; exit } END { if (!found) print 0 }' "$PROC_VMSTAT"
}

container_process_value() {
  local container="$1"
  local key="$2"
  local status
  status="$("${DOCKER_COMMAND[@]}" exec "$container" cat /proc/1/status 2>/dev/null || true)"
  awk -v key="$key" '$1 == key ":" { print $2; found=1; exit } END { if (!found) print 0 }' <<<"$status"
}

sample_once() {
  local now_epoch now_iso csv_file
  local host_mem_available host_swap_total host_swap_free host_swap_used pswpin pswpout
  local backend_exists=false backend_mem=0 backend_limit=0 backend_rss=0 backend_swap=0 backend_hwm=0
  local backend_restarts=0 backend_oom=false backend_health=missing
  local postgres_mem=0 minio_mem=0
  local stats_output line name usage containers=()

  mkdir -p "$DATA_DIR" "$LOG_DIR"
  select_docker_command
  now_epoch="${SEKERCHAT_NOW_EPOCH:-$(date +%s)}"
  now_iso="$(date '+%Y-%m-%dT%H:%M:%S%z')"
  csv_file="${SEKERCHAT_MONITOR_CSV_FILE:-$DATA_DIR/memory-$(date '+%Y%m%d-%H%M%S').csv}"

  host_mem_available="$(proc_value "$PROC_MEMINFO" MemAvailable)"
  host_swap_total="$(proc_value "$PROC_MEMINFO" SwapTotal)"
  host_swap_free="$(proc_value "$PROC_MEMINFO" SwapFree)"
  host_swap_used=$((host_swap_total - host_swap_free))
  pswpin="$(vmstat_value pswpin)"
  pswpout="$(vmstat_value pswpout)"

  if container_exists "$BACKEND_CONTAINER"; then
    backend_exists=true
    containers+=("$BACKEND_CONTAINER")
    backend_limit="$(inspect_value "$BACKEND_CONTAINER" '{{.HostConfig.Memory}}' 0)"
    backend_restarts="$(inspect_value "$BACKEND_CONTAINER" '{{.RestartCount}}' 0)"
    backend_oom="$(inspect_value "$BACKEND_CONTAINER" '{{.State.OOMKilled}}' false)"
    backend_health="$(inspect_value "$BACKEND_CONTAINER" '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' none)"
    backend_rss="$(container_process_value "$BACKEND_CONTAINER" VmRSS)"
    backend_swap="$(container_process_value "$BACKEND_CONTAINER" VmSwap)"
    backend_hwm="$(container_process_value "$BACKEND_CONTAINER" VmHWM)"
  fi

  if container_exists "$POSTGRES_CONTAINER"; then containers+=("$POSTGRES_CONTAINER"); fi
  if container_exists "$MINIO_CONTAINER"; then containers+=("$MINIO_CONTAINER"); fi
  stats_output="$("${DOCKER_COMMAND[@]}" stats --no-stream --format '{{.Name}}|{{.MemUsage}}' "${containers[@]}" 2>/dev/null || true)"
  while IFS='|' read -r name usage; do
    [ -n "$name" ] || continue
    usage="${usage%% *}"
    case "$name" in
      "$BACKEND_CONTAINER") backend_mem="$(size_to_bytes "$usage")" ;;
      "$POSTGRES_CONTAINER") postgres_mem="$(size_to_bytes "$usage")" ;;
      "$MINIO_CONTAINER") minio_mem="$(size_to_bytes "$usage")" ;;
    esac
  done <<<"$stats_output"

  if [ ! -f "$csv_file" ]; then
    printf '%s\n' "$CSV_HEADER" >"$csv_file"
  fi
  line="$now_epoch,$now_iso,$host_mem_available,$host_swap_used,$pswpin,$pswpout,$backend_exists,$backend_mem,$backend_limit,$backend_rss,$backend_swap,$backend_hwm,$backend_restarts,$backend_oom,$backend_health,$postgres_mem,$minio_mem"
  printf '%s\n' "$line" >>"$csv_file"
  printf '%s\n' "$csv_file"
}

cleanup_run() {
  rm -rf "$LOCK_DIR"
  if [ -f "$PID_FILE" ] && [ "$(cat "$PID_FILE" 2>/dev/null || true)" = "$$" ]; then
    rm -f "$PID_FILE"
  fi
}

run_monitor() {
  local started_epoch end_epoch csv_file
  require_positive_integer SEKERCHAT_MONITOR_INTERVAL_SECONDS "$INTERVAL_SECONDS"
  require_positive_integer SEKERCHAT_MONITOR_DURATION_HOURS "$DURATION_HOURS"
  mkdir -p "$DATA_DIR" "$LOG_DIR"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    fail "Memory monitor is already running (lock: $LOCK_DIR)"
  fi
  printf '%s\n' "$$" >"$PID_FILE"
  trap cleanup_run EXIT
  trap 'exit 0' HUP INT TERM

  started_epoch="$(date +%s)"
  end_epoch=$((started_epoch + DURATION_HOURS * 3600))
  csv_file="$DATA_DIR/memory-$(date '+%Y%m%d-%H%M%S').csv"
  export SEKERCHAT_MONITOR_CSV_FILE="$csv_file"
  log "Memory monitor started: interval=${INTERVAL_SECONDS}s duration=${DURATION_HOURS}h csv=$csv_file"
  while [ "$(date +%s)" -lt "$end_epoch" ]; do
    if ! sample_once >/dev/null; then
      log "WARN: sample failed; the monitor will continue"
    fi
    sleep "$INTERVAL_SECONDS" &
    wait $! || true
  done
  log "Memory monitor completed: $csv_file"
}

start_monitor() {
  require_positive_integer SEKERCHAT_MONITOR_INTERVAL_SECONDS "$INTERVAL_SECONDS"
  require_positive_integer SEKERCHAT_MONITOR_DURATION_HOURS "$DURATION_HOURS"
  mkdir -p "$DATA_DIR" "$LOG_DIR"
  if [ -f "$PID_FILE" ]; then
    local existing_pid
    existing_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
      fail "Memory monitor is already running with pid $existing_pid"
    fi
    rm -f "$PID_FILE"
  fi
  SEKERCHAT_MONITOR_INTERVAL_SECONDS="$INTERVAL_SECONDS" \
  SEKERCHAT_MONITOR_DURATION_HOURS="$DURATION_HOURS" \
  SEKERCHAT_MONITOR_DIR="$MONITOR_DIR" \
    nohup bash "$0" run >/dev/null 2>&1 &
  local pid=$!
  printf '%s\n' "$pid" >"$PID_FILE"
  sleep 1
  if ! kill -0 "$pid" 2>/dev/null; then
    fail "Memory monitor failed to start; inspect $LOG_FILE"
  fi
  printf 'Memory monitor started (pid=%s, duration=%sh, interval=%ss)\n' "$pid" "$DURATION_HOURS" "$INTERVAL_SECONDS"
}

stop_monitor() {
  [ -f "$PID_FILE" ] || fail "Memory monitor is not running"
  local pid
  pid="$(cat "$PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid"
    printf 'Memory monitor stop requested (pid=%s)\n' "$pid"
  else
    rm -f "$PID_FILE"
    rm -rf "$LOCK_DIR"
    fail "Memory monitor pid $pid is stale"
  fi
}

show_status() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      printf 'running pid=%s\n' "$pid"
      find "$DATA_DIR" -maxdepth 1 -type f -name 'memory-*.csv' -print 2>/dev/null | sort | tail -n 1
      return
    fi
  fi
  printf 'stopped\n'
  return 1
}

usage() {
  cat <<'EOF'
Usage: memory-monitor.sh <start|run|sample|status|stop> [options]

Options for start/run:
  --duration-hours N   Total collection time (default: 48)
  --interval-seconds N Sampling interval (default: 60)
EOF
}

parse_options() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --duration-hours) DURATION_HOURS="${2:-}"; shift 2 ;;
      --interval-seconds) INTERVAL_SECONDS="${2:-}"; shift 2 ;;
      *) fail "Unknown option: $1" ;;
    esac
  done
}

command="${1:-}"
if [ "$#" -gt 0 ]; then shift; fi
case "$command" in
  start) parse_options "$@"; start_monitor ;;
  run) parse_options "$@"; run_monitor ;;
  sample) [ "$#" -eq 0 ] || fail "sample does not accept options"; sample_once ;;
  status) [ "$#" -eq 0 ] || fail "status does not accept options"; show_status ;;
  stop) [ "$#" -eq 0 ] || fail "stop does not accept options"; stop_monitor ;;
  *) usage; exit 2 ;;
esac
