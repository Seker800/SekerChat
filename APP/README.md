# SekerChat application workspace

本目录是 SekerChat 的应用实现区。架构以模块化单体为主：React 客户端、NestJS
业务服务、PostgreSQL 业务数据和 MinIO 对象存储。

## Structure

- `apps/backend` - NestJS + Prisma + JWT + email code auth baseline
- `apps/frontend-react` - 第 4 阶段正式前端，React + Vite + React Router + TanStack Query + Zustand
- `native/desktop-pet` - 独立的 C# / WPF Windows 桌面消息助手，不参与 npm 或 Docker 构建
- `notes/` - implementation notes and coding report
- `scripts/` - build helpers and the project-local core auto-runner

## Core auto-runner

最小用法见 `docs/README.md`。

本地启动与验证手册见 `docs/local-dev-runbook.md`。
环境边界与发布模型见 `docs/environment-model.md`。

常用命令：

```bash
cd APP
npm run auto-slice:inspect
npm run auto-slice:run
npm run auto-slice:signal
npm run review:web
```

`npm run auto-slice:signal` 只会输出 `DISPATCH_REVIEW_NOW` 或 `NO_REPLY`。
如果需要给外层 cron / trigger 一个稳定输入，直接读取 `50-handoff/auto-slice-trigger.json`，不要自己从大 JSON 里推断是否该派发 review。

## Local Run

### 1. Install dependencies

```bash
cd APP
npm ci
```

### 2. Configure env

```bash
cp deploy/local-dev/.env.example deploy/local-dev/.env
cp apps/backend/.env.example apps/backend/.env.development.local
docker compose --env-file deploy/local-dev/.env \
  -f deploy/local-dev/docker-compose.yml up -d
```

说明：
- `apps/frontend-react/.env` 已带本地默认值。
- 如果你要覆盖代理地址、开发登录邮箱等值，优先写到 `apps/frontend-react/.env.local`。
- 真实开发密钥放在本机 `.env.development.local`；生产密钥只放在部署主机的
  `deploy/synology/.env`。统一规则见 `docs/secret-storage-guide.md`。
- 当前正式口径是“群晖纯生产，本机纯开发”；开发环境不要直连群晖生产数据面。

Required backend env highlights:
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `APP_BASE_URL`
- `ADMIN_EMAILS` (optional, only for bootstrapping local admins)

If you want attachment upload to work locally, you also need object storage. This repo includes a MinIO setup for local Docker:

Attachment upload now requires a reachable S3-compatible object storage endpoint. Set these values in `apps/backend/.env.development.local` before starting the backend:

- `S3_ENDPOINT`
- `S3_BUCKET`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

### 3. Prepare database

```bash
npm run prisma:generate --workspace @sekerchat/backend
npm run prisma:migrate --workspace @sekerchat/backend
```

### 4. Start apps

```bash
npm run dev:backend
npm run dev:frontend
```

Frontend default flow:
1. 打开前端登录页
2. 使用已配置的 OIDC 提供方或本地认证方式登录
3. 登录后调用 `/users/me`、群组列表和消息列表验证受保护接口
4. 如需测试 reminder 或邮箱验证码 fallback，可单独请求验证码
5. 如需测试图片/文件上传，确保 MinIO 已启动且后端已重启读取新的 `.env`

### Single-port access

- Frontend dev server listens on `0.0.0.0:5173`
- Backend should stay on `HOST=127.0.0.1` and `PORT=3100`
- Frontend dev requests for `/api` and `/realtime` are proxied to `VITE_PROXY_API_TARGET`
- External users should only access `http://<your-lan-ip>:5173`
- Do not expose backend `3100` directly when using this single-port mode

如果你的局域网 IP 变化了，更新这几个值后重启前后端：
- `apps/backend/.env.development.local` 的 `APP_BASE_URL`
- `apps/backend/.env.development.local` 的 `API_BASE_URL`
- `apps/backend/.env.development.local` 的 `OIDC_REDIRECT_URI`
- 其他电脑访问时使用 `http://你的电脑局域网IP:5173`

## Web Review Checks

项目现在内置了基于 Playwright 的网页 review 检查，用于在 review 时自动验证关键页面，而不是只看代码 diff。

常用命令：

```bash
cd APP
npm run review:web
```

这条命令会：
- 启动前端测试服务器
- 执行关键页面 smoke
- 校验截图基线
- 在失败时保留截图、trace 和视频

当前已覆盖：
- 未登录首页
- 已登录工作台
- 管理页

注意：
- `npm run review:web` 主要是 mocked 页面 review，用于验证页面结构、状态文案和截图基线。
- 它不会证明真实后端登录链路一定可用；现有工作台 smoke 默认通过 Playwright fixture 直接注入已登录 session。
- 如果要验证“主页可打开并且真的能完成登录”，请额外运行真实浏览器登录 smoke：

```bash
cd APP
PLAYWRIGHT_LIVE_BASE_URL=http://127.0.0.1:5173 \
PLAYWRIGHT_LIVE_LOGIN_EMAIL=your-email@example.com \
PLAYWRIGHT_LIVE_LOGIN_PASSWORD='your-password' \
npm run smoke:web-login
```

- 这条用例会从首页真实填写登录表单，不再伪造 session。

版本库中提交的是：
- Playwright 配置
- E2E 用例
- 少量稳定页面的截图基线

不会提交的是运行产物：
- `playwright-report/`
- `test-results/`
- 失败截图、trace、video

如果页面改动是预期的，可在确认视觉变化正确后更新截图基线：

```bash
cd APP
npm run test:e2e:update
```

## Historical note

- Slice 1 的原始 acceptance targets 是：白名单邮箱可请求验证码并登录、非白名单邮箱被拒绝、登录后前端可调用后端受保护接口 `/users/me`
- 这些目标已不是当前唯一状态来源；当前进度以 `50-handoff/status.md`、`APP/notes/` 与 `40-review/reports/` 为准
- 第 4 阶段起，根脚本、Playwright review 和截图基线默认都已切到 `apps/frontend-react`

## Current limitation

当前目录不再保留“无法执行 `npm install` / build / typecheck`”这类历史性结论作为通用真相源；任何验证限制应写入对应 slice 的最新 implementation / review report。
