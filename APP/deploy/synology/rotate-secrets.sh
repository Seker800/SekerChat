#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE=".env"
POSTGRES_SERVICE="${POSTGRES_SERVICE:-postgres}"
MINIO_SERVICE="${MINIO_SERVICE:-minio}"
BACKEND_SERVICE="${BACKEND_SERVICE:-backend}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-}"
MINIO_CONTAINER="${MINIO_CONTAINER:-}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-}"
POSTGRES_APP_USER="${POSTGRES_APP_USER:-sekerchat_app}"
MINIO_APP_USER="${MINIO_APP_USER:-sekerchat-app}"
NO_RESTART=0
MINIO_EXEC_MODE=""

usage() {
  cat <<'EOF'
Usage: bash rotate-secrets.sh [options]

Options:
  --env-file <path>            Path to the production .env file. Default: ./.env
  --postgres-service <name>    Compose service name for PostgreSQL. Default: postgres
  --minio-service <name>       Compose service name for MinIO. Default: minio
  --backend-service <name>     Compose service name for backend. Default: backend
  --postgres-container <name>  Override PostgreSQL container name
  --minio-container <name>     Override MinIO container name
  --backend-container <name>   Override backend container name
  --postgres-app-user <name>   Application database user. Default: sekerchat_app
  --minio-app-user <name>      Application MinIO user/access key. Default: sekerchat-app
  --no-restart                 Update credentials but skip backend restart
  --help                       Show this message

Environment overrides:
  NEW_POSTGRES_APP_PASSWORD
  NEW_POSTGRES_ADMIN_PASSWORD
  NEW_MINIO_APP_ACCESS_KEY
  NEW_MINIO_APP_SECRET_KEY
  NEW_MINIO_ROOT_PASSWORD
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --postgres-service)
      POSTGRES_SERVICE="$2"
      shift 2
      ;;
    --minio-service)
      MINIO_SERVICE="$2"
      shift 2
      ;;
    --backend-service)
      BACKEND_SERVICE="$2"
      shift 2
      ;;
    --postgres-container)
      POSTGRES_CONTAINER="$2"
      shift 2
      ;;
    --minio-container)
      MINIO_CONTAINER="$2"
      shift 2
      ;;
    --backend-container)
      BACKEND_CONTAINER="$2"
      shift 2
      ;;
    --postgres-app-user)
      POSTGRES_APP_USER="$2"
      shift 2
      ;;
    --minio-app-user)
      MINIO_APP_USER="$2"
      shift 2
      ;;
    --no-restart)
      NO_RESTART=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

DOCKER_BIN="${DOCKER_BIN:-}"
if [ -z "$DOCKER_BIN" ]; then
  if [ -x /usr/local/bin/docker ]; then
    DOCKER_BIN="/usr/local/bin/docker"
  elif command -v docker >/dev/null 2>&1; then
    DOCKER_BIN="$(command -v docker)"
  fi
fi

if [ -z "$DOCKER_BIN" ]; then
  echo "docker is required." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required." >&2
  exit 1
fi

DOCKER_COMPOSE=()
if "$DOCKER_BIN" compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE=("$DOCKER_BIN" compose)
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE=(docker-compose)
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

POSTGRES_ADMIN_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB_NAME="${POSTGRES_DB:-sekerchat}"
POSTGRES_ADMIN_PASSWORD_CURRENT="${POSTGRES_PASSWORD:-}"
MINIO_ROOT_USERNAME="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD_CURRENT="${MINIO_ROOT_PASSWORD:-}"
S3_BUCKET_NAME="${S3_BUCKET:-sekerchat}"

NEW_POSTGRES_APP_PASSWORD="${NEW_POSTGRES_APP_PASSWORD:-$(openssl rand -hex 16)}"
NEW_POSTGRES_ADMIN_PASSWORD="${NEW_POSTGRES_ADMIN_PASSWORD:-$(openssl rand -hex 16)}"
NEW_MINIO_APP_ACCESS_KEY="${NEW_MINIO_APP_ACCESS_KEY:-$MINIO_APP_USER}"
NEW_MINIO_APP_SECRET_KEY="${NEW_MINIO_APP_SECRET_KEY:-$(openssl rand -hex 20)}"
NEW_MINIO_ROOT_PASSWORD="${NEW_MINIO_ROOT_PASSWORD:-$(openssl rand -hex 20)}"

log() {
  printf '[rotate-secrets] %s\n' "$*"
}

require_env_value() {
  local key="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "Missing required value: $key" >&2
    exit 1
  fi
}

require_env_value "POSTGRES_USER" "$POSTGRES_ADMIN_USER"
require_env_value "POSTGRES_DB" "$POSTGRES_DB_NAME"
require_env_value "POSTGRES_PASSWORD" "$POSTGRES_ADMIN_PASSWORD_CURRENT"
require_env_value "MINIO_ROOT_USER" "$MINIO_ROOT_USERNAME"
require_env_value "MINIO_ROOT_PASSWORD" "$MINIO_ROOT_PASSWORD_CURRENT"
require_env_value "S3_BUCKET" "$S3_BUCKET_NAME"

compose_has_service() {
  if [ "${#DOCKER_COMPOSE[@]}" -eq 0 ]; then
    return 1
  fi
  "${DOCKER_COMPOSE[@]}" config --services 2>/dev/null | grep -Fx "$1" >/dev/null 2>&1
}

auto_detect_container() {
  local override="$1"
  local pattern="$2"
  if [ -n "$override" ]; then
    printf '%s\n' "$override"
    return 0
  fi
  "$DOCKER_BIN" ps --format '{{.Names}}' | grep -E "$pattern" | head -n 1
}

POSTGRES_MODE="container"
MINIO_MODE="container"
BACKEND_MODE="container"

if compose_has_service "$POSTGRES_SERVICE"; then
  POSTGRES_MODE="compose"
else
  POSTGRES_CONTAINER="$(auto_detect_container "$POSTGRES_CONTAINER" '(^|-)postgres(-|$)|sekerchat-postgres')"
fi

if compose_has_service "$MINIO_SERVICE"; then
  MINIO_MODE="compose"
else
  MINIO_CONTAINER="$(auto_detect_container "$MINIO_CONTAINER" '(^|-)minio(-|$)|sekerchat-minio')"
fi

if compose_has_service "$BACKEND_SERVICE"; then
  BACKEND_MODE="compose"
else
  BACKEND_CONTAINER="$(auto_detect_container "$BACKEND_CONTAINER" '(^|-)backend(-|$)|sekerchat-backend')"
fi

if [ "$POSTGRES_MODE" = "container" ] && [ -z "$POSTGRES_CONTAINER" ]; then
  echo "Unable to locate PostgreSQL container. Pass --postgres-container." >&2
  exit 1
fi

if [ "$MINIO_MODE" = "container" ] && [ -z "$MINIO_CONTAINER" ]; then
  echo "Unable to locate MinIO container. Pass --minio-container." >&2
  exit 1
fi

minio_container_has_mc() {
  if [ "$MINIO_MODE" = "compose" ]; then
    "${DOCKER_COMPOSE[@]}" exec -T "$MINIO_SERVICE" sh -lc 'command -v mc >/dev/null 2>&1'
  else
    "$DOCKER_BIN" exec -i "$MINIO_CONTAINER" sh -lc 'command -v mc >/dev/null 2>&1'
  fi
}

if minio_container_has_mc; then
  MINIO_EXEC_MODE="container"
elif command -v mc >/dev/null 2>&1; then
  MINIO_EXEC_MODE="host"
else
  echo "Unable to locate mc in the MinIO container or on the host." >&2
  exit 1
fi

run_psql_superuser() {
  if [ "$POSTGRES_MODE" = "compose" ]; then
    "${DOCKER_COMPOSE[@]}" exec -T -u postgres "$POSTGRES_SERVICE" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_ADMIN_USER" -d "$POSTGRES_DB_NAME"
  else
    "$DOCKER_BIN" exec -i -u postgres "$POSTGRES_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_ADMIN_USER" -d "$POSTGRES_DB_NAME"
  fi
}

run_psql_app_validation() {
  local password="$1"
  if [ "$POSTGRES_MODE" = "compose" ]; then
    "${DOCKER_COMPOSE[@]}" exec -T -e PGPASSWORD="$password" "$POSTGRES_SERVICE" \
      psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U "$POSTGRES_APP_USER" -d "$POSTGRES_DB_NAME" -c 'SELECT count(*) FROM "Group";'
  else
    "$DOCKER_BIN" exec -i -e PGPASSWORD="$password" "$POSTGRES_CONTAINER" \
      psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U "$POSTGRES_APP_USER" -d "$POSTGRES_DB_NAME" -c 'SELECT count(*) FROM "Group";'
  fi
}

run_minio_cmd() {
  if [ "$MINIO_EXEC_MODE" = "host" ]; then
    sh -lc "$1"
  elif [ "$MINIO_MODE" = "compose" ]; then
    "${DOCKER_COMPOSE[@]}" exec -T "$MINIO_SERVICE" sh -lc "$1"
  else
    "$DOCKER_BIN" exec -i "$MINIO_CONTAINER" sh -lc "$1"
  fi
}

restart_backend() {
  if [ "$NO_RESTART" -eq 1 ]; then
    log "Skipping backend restart due to --no-restart."
    return 0
  fi

  if [ "$BACKEND_MODE" = "compose" ]; then
    "${DOCKER_COMPOSE[@]}" restart "$BACKEND_SERVICE"
    "${DOCKER_COMPOSE[@]}" logs --tail 30 "$BACKEND_SERVICE"
  elif [ -n "$BACKEND_CONTAINER" ]; then
    "$DOCKER_BIN" restart "$BACKEND_CONTAINER"
    "$DOCKER_BIN" logs "$BACKEND_CONTAINER" --tail 30
  else
    log "Backend container not found. Credentials were updated, but backend restart was skipped."
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local escaped_value
  escaped_value="$(printf '%s' "$value" | sed 's/[&/]/\\&/g')"
  if grep -Eq "^${key}=" "$ENV_FILE"; then
    sed -i.bak "s/^${key}=.*/${key}=${escaped_value}/" "$ENV_FILE"
    rm -f "${ENV_FILE}.bak"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

replace_database_url_userinfo() {
  local url="${DATABASE_URL:-}"
  local value
  if [ -n "$url" ]; then
    value="$(printf '%s' "$url" | sed -E "s#^(postgres(ql)?://)[^:]+:[^@]+@#\\1${POSTGRES_APP_USER}:${NEW_POSTGRES_APP_PASSWORD}@#")"
  else
    value="postgresql://${POSTGRES_APP_USER}:${NEW_POSTGRES_APP_PASSWORD}@postgres:5432/${POSTGRES_DB_NAME}?schema=public"
  fi
  set_env_value "DATABASE_URL" "$value"
}

ENV_BACKUP="${ENV_FILE}.before-rotate.$(date +%Y%m%d%H%M%S)"
cp "$ENV_FILE" "$ENV_BACKUP"
log "Backed up env file to $ENV_BACKUP"

log "Creating or updating PostgreSQL application user: $POSTGRES_APP_USER"
run_psql_superuser <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${POSTGRES_APP_USER}') THEN
    CREATE USER ${POSTGRES_APP_USER} WITH PASSWORD '${NEW_POSTGRES_APP_PASSWORD}' LOGIN;
  ELSE
    ALTER USER ${POSTGRES_APP_USER} WITH PASSWORD '${NEW_POSTGRES_APP_PASSWORD}';
  END IF;
END
\$\$;
GRANT CONNECT ON DATABASE ${POSTGRES_DB_NAME} TO ${POSTGRES_APP_USER};
GRANT USAGE ON SCHEMA public TO ${POSTGRES_APP_USER};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${POSTGRES_APP_USER};
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${POSTGRES_APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${POSTGRES_APP_USER};
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${POSTGRES_APP_USER};
SQL

log "Creating or updating MinIO application user: $NEW_MINIO_APP_ACCESS_KEY"
run_minio_cmd "mc alias set rotate-local http://127.0.0.1:9000 '${MINIO_ROOT_USERNAME}' '${MINIO_ROOT_PASSWORD_CURRENT}' >/dev/null"
run_minio_cmd "mc admin user add rotate-local '${NEW_MINIO_APP_ACCESS_KEY}' '${NEW_MINIO_APP_SECRET_KEY}' >/dev/null 2>&1 || mc admin user edit rotate-local '${NEW_MINIO_APP_ACCESS_KEY}' --secret-key '${NEW_MINIO_APP_SECRET_KEY}' >/dev/null"
run_minio_cmd "cat >/tmp/sekerchat-app-policy.json <<'EOF'
{
  \"Version\": \"2012-10-17\",
  \"Statement\": [
    {
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:ListBucket\"],
      \"Resource\": [\"arn:aws:s3:::${S3_BUCKET_NAME}\"]
    },
    {
      \"Effect\": \"Allow\",
      \"Action\": [\"s3:GetObject\", \"s3:PutObject\", \"s3:DeleteObject\", \"s3:ListMultipartUploadParts\", \"s3:AbortMultipartUpload\"],
      \"Resource\": [\"arn:aws:s3:::${S3_BUCKET_NAME}/*\"]
    }
  ]
}
EOF
mc admin policy create rotate-local sekerchat-app-policy /tmp/sekerchat-app-policy.json >/dev/null
mc admin policy attach rotate-local sekerchat-app-policy --user '${NEW_MINIO_APP_ACCESS_KEY}' >/dev/null
mc alias set rotate-app http://127.0.0.1:9000 '${NEW_MINIO_APP_ACCESS_KEY}' '${NEW_MINIO_APP_SECRET_KEY}' >/dev/null
mc ls rotate-app/${S3_BUCKET_NAME}/ >/dev/null
"

log "Updating env file with new application credentials"
replace_database_url_userinfo
set_env_value "S3_ACCESS_KEY_ID" "$NEW_MINIO_APP_ACCESS_KEY"
set_env_value "S3_SECRET_ACCESS_KEY" "$NEW_MINIO_APP_SECRET_KEY"
set_env_value "POSTGRES_PASSWORD" "$NEW_POSTGRES_ADMIN_PASSWORD"
set_env_value "MINIO_ROOT_PASSWORD" "$NEW_MINIO_ROOT_PASSWORD"

log "Restarting backend with new application credentials"
restart_backend

log "Validating PostgreSQL application access"
run_psql_app_validation "$NEW_POSTGRES_APP_PASSWORD"

log "Rotating PostgreSQL admin password"
run_psql_superuser <<SQL
ALTER USER ${POSTGRES_ADMIN_USER} WITH PASSWORD '${NEW_POSTGRES_ADMIN_PASSWORD}';
SQL

log "Rotating MinIO root password"
run_minio_cmd "mc alias set rotate-local http://127.0.0.1:9000 '${MINIO_ROOT_USERNAME}' '${MINIO_ROOT_PASSWORD_CURRENT}' >/dev/null && mc admin user edit rotate-local '${MINIO_ROOT_USERNAME}' --secret-key '${NEW_MINIO_ROOT_PASSWORD}' >/dev/null"

log "Rotation complete."
log "Updated env file: $ENV_FILE"
log "PostgreSQL app user: $POSTGRES_APP_USER"
log "MinIO app access key: $NEW_MINIO_APP_ACCESS_KEY"
log "Review backend logs above before leaving the maintenance window."
