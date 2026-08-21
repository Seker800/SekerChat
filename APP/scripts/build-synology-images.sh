#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_ROOT"

PLATFORM="${PLATFORM:-linux/amd64}"
OUTPUT_DIR="${OUTPUT_DIR:-$APP_ROOT/.deploy-artifacts}"
VERSION="$(node "$SCRIPT_DIR/release-version.mjs" "${1:-}" --ensure-fresh "$OUTPUT_DIR")"

# 基础镜像统一存放在用户本地目录，不跟随项目 Git
BASE_IMAGES_DIR="${BASE_IMAGES_DIR:-$HOME/.sekerchat-base-images}"

FRONTEND_IMAGE="sekerchat-frontend:${VERSION}"
BACKEND_IMAGE="sekerchat-backend:${VERSION}"

REQUIRED_IMAGES=(
  "node-22-bookworm-slim-amd64.tar.gz"
  "nginx-1.27-alpine-amd64.tar.gz"
)

mkdir -p "$OUTPUT_DIR"

# ── 加载离线基础镜像 ──────────────────────────────────
echo "[build-synology-images] loading base images from $BASE_IMAGES_DIR"
missing=()
for img in "${REQUIRED_IMAGES[@]}"; do
  path="$BASE_IMAGES_DIR/$img"
  if [ -f "$path" ]; then
    echo "  loading $img ..."
    gzip -dc "$path" | docker load
  else
    missing+=("$img")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo ""
  echo "❌ 缺少基础镜像："
  for m in "${missing[@]}"; do
    echo "   - $m"
  done
  echo ""
  echo "请将基础镜像文件放到 $BASE_IMAGES_DIR/ 后再构建。"
  echo "获取方式见 APP/docs/synology-deployment.md 的「基础镜像管理」章节。"
  exit 1
fi

# ── 构建（纯离线） ────────────────────────────────────
echo "[build-synology-images] building $FRONTEND_IMAGE for $PLATFORM"
docker buildx build \
  --platform "$PLATFORM" \
  --pull=false \
  -f apps/frontend-react/Dockerfile \
  -t "$FRONTEND_IMAGE" \
  --load .

echo "[build-synology-images] building $BACKEND_IMAGE for $PLATFORM"
docker buildx build \
  --platform "$PLATFORM" \
  --pull=false \
  -f apps/backend/Dockerfile \
  -t "$BACKEND_IMAGE" \
  --load .

# ── 导出 ──────────────────────────────────────────────
echo "[build-synology-images] exporting $FRONTEND_IMAGE"
docker save "$FRONTEND_IMAGE" | gzip > "$OUTPUT_DIR/sekerchat-frontend-${VERSION}.tar.gz"

echo "[build-synology-images] exporting $BACKEND_IMAGE"
docker save "$BACKEND_IMAGE" | gzip > "$OUTPUT_DIR/sekerchat-backend-${VERSION}.tar.gz"

GIT_SHA="$(git rev-parse HEAD)"
FRONTEND_IMAGE_ID="$(docker image inspect "$FRONTEND_IMAGE" --format '{{.Id}}')"
BACKEND_IMAGE_ID="$(docker image inspect "$BACKEND_IMAGE" --format '{{.Id}}')"
(
  cd "$OUTPUT_DIR"
  sha256sum \
    "sekerchat-frontend-${VERSION}.tar.gz" \
    "sekerchat-backend-${VERSION}.tar.gz" \
    > "sekerchat-${VERSION}.sha256"
)
cat > "$OUTPUT_DIR/sekerchat-${VERSION}.release.env" <<EOF
version=$VERSION
git_sha=$GIT_SHA
frontend_image=$FRONTEND_IMAGE
frontend_image_id=$FRONTEND_IMAGE_ID
backend_image=$BACKEND_IMAGE
backend_image_id=$BACKEND_IMAGE_ID
sbom_source=.github/workflows/ci.yml
EOF

cat <<EOF
[build-synology-images] done
version=$VERSION
platform=$PLATFORM
artifacts:
  $OUTPUT_DIR/sekerchat-frontend-${VERSION}.tar.gz
  $OUTPUT_DIR/sekerchat-backend-${VERSION}.tar.gz
  $OUTPUT_DIR/sekerchat-${VERSION}.sha256
  $OUTPUT_DIR/sekerchat-${VERSION}.release.env
EOF
