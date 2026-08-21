# Local Dev Runbook

这份说明只描述当前正式开发口径：

- 本机是纯开发
- 前后端在本机裸跑
- PostgreSQL 和 MinIO 也在本机运行
- 开发环境绝不直连群晖生产数据面

完整边界定义见 [Environment Model](./environment-model.md)。

## Dev Topology

本机开发环境由两部分组成：

1. 代码进程
   - `npm run dev:backend`
   - `npm run dev:frontend`
2. 本机数据面
   - PostgreSQL
   - MinIO

本机数据面模板位于：

- [APP/deploy/local-dev/docker-compose.yml](../deploy/local-dev/docker-compose.yml)
- [APP/deploy/local-dev/.env.example](../deploy/local-dev/.env.example)

本机 backend 配置入口现在固定分成两份并存：

- `APP/apps/backend/.env.development.local`
- `APP/apps/backend/.env.production.reference.local`

`npm run dev:backend` 会自动读取开发配置，不再要求你手工改同一个 `.env`。

## Hard Rules

- 本机开发环境绝不直连群晖生产数据库
- 本机开发环境绝不直连群晖生产 MinIO bucket
- 需要真实样本时，只允许“生产导出 -> 本机恢复”

不要把开发和生产参考都塞进同一个 `apps/backend/.env` 来回覆盖。

## Current local defaults

以仓库里的实际文件为准：

- backend dev env: `APP/apps/backend/.env.development.local`
- backend reference env: `APP/apps/backend/.env.production.reference.local`
- frontend env: [`APP/apps/frontend-react/.env`](../apps/frontend-react/.env)

常见本机默认值：

- backend host: `127.0.0.1`
- backend port: `3100`
- frontend preferred port: `5173`
- postgres: `localhost:5432`
- minio api: `localhost:9000`
- minio console: `localhost:9001`

## Startup order

推荐顺序：

1. 检查端口，避免重复实例
2. 启动本机 Postgres 和 MinIO
3. 检查 Prisma 可连本机数据库
4. 启动 backend
5. 启动 frontend
6. 做 health check 和最小 smoke

## Startup safety

每次启动前先检查端口，不要直接 `npm run dev`。

检查 backend：

```bash
lsof -nP -iTCP:3100 -sTCP:LISTEN
```

检查 frontend：

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

如果出现旧实例，先清掉：

```bash
pkill -f "nest start"
pkill -f "apps/backend/dist"
pkill -f "node.*vite"
```

## Start local data plane

```bash
cd APP/deploy/local-dev
cp .env.example .env
mkdir -p runtime/postgres runtime/minio
docker compose up -d
```

检查状态：

```bash
docker compose ps
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

## Configure local env

开发环境下，后端至少要确保这些值来自开发配置而且指向本机：

- `DATABASE_URL`
- `S3_ENDPOINT`
- `S3_PUBLIC_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `FILE_ACCESS_SECRET`

开发配置示例：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sekerchat_dev?schema=public"
S3_ENDPOINT=http://127.0.0.1:9000
S3_BUCKET=sekerchat-dev
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
```

上传默认走同源 API 代理：浏览器把分片 `PUT` 到当前页面同源的 `/api/uploads/:sessionId/parts/:partNumber`，后端再通过 `S3_ENDPOINT` 写入 MinIO。因此从 `localhost`、局域网 IP 或外网域名访问同一套前端时，上传不依赖固定的 `S3_PUBLIC_ENDPOINT`。

`S3_PUBLIC_ENDPOINT` 只用于可选的对象存储直连下载/预览优化。只有当 MinIO 对所有目标客户端都有同一个稳定可达地址时才设置它；否则留空，让前端回退到后端代理下载/预览。

前端默认继续通过：

```env
VITE_PROXY_API_TARGET=http://127.0.0.1:3100
```

Vite 默认允许 localhost、`.localhost` 和 IP 地址访问。使用自定义开发域名时，通过
Vite 官方变量显式添加自己控制的主机名，不要在源码中写死维护者域名：

```env
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=chat.example.test,.chat.example.test
```

## Database check

不要从仓库根目录直接跑 Prisma 检查。

正确方式：

```bash
cd APP/apps/backend
npx prisma migrate status --schema prisma/schema.prisma
```

如需生成 Prisma Client：

```bash
cd APP
npm run prisma:generate --workspace @sekerchat/backend
```

如需执行迁移：

```bash
cd APP
npm run prisma:migrate --workspace @sekerchat/backend
```

## Start backend

```bash
cd APP
npm run dev:backend
```

这条命令会自动加载：

`apps/backend/.env.development.local`

成功后检查：

```bash
curl -sS http://127.0.0.1:3100/api/health
```

预期：

```json
{ "status": "ok" }
```

## Start frontend

```bash
cd APP
npm run dev:frontend
```

Vite 如因冲突切到别的端口，以实际输出为准。

启动后至少检查：

```bash
curl -I http://127.0.0.1:5173
curl -sS http://127.0.0.1:5173/api/health
```

## Real-sample import rule

需要真实样本时：

1. 先从生产导出 dump
2. 复制到本机导入目录
3. 恢复到本机开发库
4. 必要时脱敏
5. 只让本机后端连接恢复后的本机库

不要为了图快把开发配置里的 `DATABASE_URL` 或 `S3_ENDPOINT` 临时指回群晖。
