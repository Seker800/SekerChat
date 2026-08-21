#!/bin/bash
set -euo pipefail

# ============================================================
# SekerChat 群晖部署脚本
# 用法: bash deploy.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================="
echo "  SekerChat 群晖部署"
echo "========================================="
echo ""

# ── 检查 docker 是否可用 ──────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "❌ 未找到 docker，请确认群晖已安装 Docker 套件"
    exit 1
fi

DOCKER_COMPOSE=""
if docker compose version &>/dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &>/dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "❌ 未找到 docker compose 或 docker-compose"
    exit 1
fi

# ── 创建数据目录 ──────────────────────────────────────
mkdir -p ./data/postgres
mkdir -p ./data/minio
mkdir -p ./backups

echo "数据目录: $SCRIPT_DIR/data"
echo ""

# ── 拉取镜像 ──────────────────────────────────────────
echo ">>> 拉取镜像..."
$DOCKER_COMPOSE pull
echo ""

# ── 启动容器 ──────────────────────────────────────────
echo ">>> 启动容器..."
$DOCKER_COMPOSE up -d
echo ""

# ── 等待健康检查通过 ──────────────────────────────────
echo ">>> 等待 PostgreSQL 就绪..."
for i in $(seq 1 30); do
    if docker exec sekerchat-postgres pg_isready -U postgres -d sekerchat &>/dev/null; then
        echo "✅ PostgreSQL 就绪"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "⚠️  PostgreSQL 启动超时，请手动检查"
    fi
    sleep 2
done

echo ">>> 等待 MinIO 就绪..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:9000/minio/health/live &>/dev/null; then
        echo "✅ MinIO 就绪"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "⚠️  MinIO 启动超时，请手动检查"
    fi
    sleep 2
done

echo ""
echo "========================================="
echo "  部署完成"
echo "========================================="
echo ""
echo "服务地址:"
echo "  PostgreSQL : <群晖IP>:5432"
echo "  MinIO API  : <群晖IP>:9000"
echo "  MinIO 控制台: <群晖IP>:9001"
echo ""
echo "请使用 docker-compose.yml 中配置的 PostgreSQL / MinIO 账号密码完成后续接入。"
echo ""
echo "下一步:"
echo "  1. 浏览器打开 <群晖IP>:9001 登录 MinIO 控制台"
echo "  2. 创建一个 bucket，命名为 sekerchat"
echo "  3. 在 DSM 控制面板添加定时任务运行 backup.sh"
echo ""
