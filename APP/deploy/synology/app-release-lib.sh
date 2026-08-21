compose() {
  if [ -n "${COMPOSE_BIN:-}" ]; then
    "$COMPOSE_BIN" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  else
    "$DOCKER_BIN" compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
  fi
}

deploy_service_tag() {
  local service="$1"
  local tag="$2"

  if [ -z "$tag" ]; then
    printf 'ERROR: empty image tag for %s.\n' "$service" >&2
    return 1
  fi
  APP_IMAGE_TAG="$tag" compose up -d --no-deps "$service"
}

deploy_service_image() {
  local service="$1"
  local repository="$2"
  local image="$3"

  case "$image" in
    "$repository":*) deploy_service_tag "$service" "${image#"$repository:"}" ;;
    *)
      printf 'ERROR: previous %s image cannot be restored safely: %s\n' "$service" "$image" >&2
      return 1
      ;;
  esac
}

wait_for_service() {
  local container="$1"
  local label="$2"
  local attempt
  local health_status

  for ((attempt = 1; attempt <= READINESS_ATTEMPTS; attempt += 1)); do
    health_status="$(
      "$DOCKER_BIN" inspect "$container" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' 2>/dev/null || true
    )"
    if [ "$health_status" = 'healthy' ]; then
      return 0
    fi
    if [ "$attempt" -lt "$READINESS_ATTEMPTS" ]; then
      sleep 2
    fi
  done

  printf 'ERROR: %s did not become ready.\n' "$label" >&2
  return 1
}

wait_for_backend() {
  wait_for_service sekerchat-backend backend
}

wait_for_frontend() {
  wait_for_service sekerchat-frontend frontend
}

restore_backend() {
  local backend_image="$1"
  deploy_service_image backend sekerchat-backend "$backend_image" && wait_for_backend
}

restore_application() {
  local backend_image="$1"
  local frontend_image="$2"
  local failed=0

  if ! deploy_service_image backend sekerchat-backend "$backend_image" || ! wait_for_backend; then
    failed=1
  fi
  if ! deploy_service_image frontend sekerchat-frontend "$frontend_image" || ! wait_for_frontend; then
    failed=1
  fi
  return "$failed"
}
