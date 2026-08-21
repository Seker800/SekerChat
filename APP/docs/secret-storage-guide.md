# Secret Storage Guide

这份说明只解决一个问题：

- 真实密钥应该放哪里
- 哪些文件可以提交 Git
- 哪些文件不能提交 Git
- Codex / Claude 需要访问密钥时，应该读哪份文件

## One rule

真实密钥只放在机器本地的 `.env` 文件里。

示例值和占位符只放在 `.env.example` 里。

## Current layout

### 1. Mac 本地开发

真实开发密钥放这里：

- `apps/backend/.env.development.local`
- `apps/backend/.env.production.reference.local`
- `apps/frontend-react/.env`
- 如果你需要本地覆盖前端变量，也可以用 `apps/frontend-react/.env.local`

用途：

- 本地开发运行
- Codex / Claude 在这台 Mac 上帮你调试
- 本地手动启动 backend / frontend

规则：

- 可以存在本机
- 不要提交 Git
- 不要发给别人
- 不要上传公开网盘

### 2. 群晖生产

真实生产密钥放这里：

- `deploy/synology/.env`

用途：

- 群晖 `docker compose` / `Container Manager` 正式运行

规则：

- 只放群晖自己的生产值
- 不要和 Mac 开发 `.env` 共用同一套密码
- 不要提交 Git

### 3. 可提交到 Git 的模板文件

这些文件可以提交：

- `apps/backend/.env.example`
- `deploy/synology/.env.example`

用途：

- 告诉你“需要哪些变量”
- 给新机器或新环境一个模板

规则：

- 只能放占位符
- 不能放真实密码
- 不能放真实数据库连接串

## Recommended split

### 开发环境

放在 `apps/backend/.env.development.local`：

- 本地数据库连接
- 本地 JWT secret
- 本地 OIDC 测试参数
- 本地 S3 / MinIO 参数

### 生产环境

放在 `deploy/synology/.env`：

- 群晖生产数据库连接
- 生产 JWT secret
- 生产 OIDC secret
- 生产 MinIO / S3 secret

## Very important

开发和生产不要共用下面这些值：

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `OIDC_CLIENT_SECRET`
- `S3_SECRET_ACCESS_KEY`
- `FILE_ACCESS_SECRET`
- 其他 shared secret

这样做的原因很简单：

- Mac 开发环境更容易被调试、查看、复制
- 群晖生产环境是正式运行面
- 两边分开后，开发环境出问题时，不会直接等于生产环境一起出问题

## What Codex / Claude should read

在 Mac 本地开发时：

- 默认读 `apps/backend/.env.development.local`

在群晖生产部署时：

- 读 `deploy/synology/.env`

不要让 agent 去读 `.env.example` 当真实值来源。

## Setup checklist

### Mac 开发机

1. 保留 `apps/backend/.env`
2. 保留 `apps/backend/.env.development.local`
3. 如需保留当前生产参考值，放在 `apps/backend/.env.production.reference.local`
4. 保留 `apps/frontend-react/.env` 或 `.env.local`
5. 确认这些文件没有被 Git 跟踪

### 群晖生产机

1. 用 `deploy/synology/.env.example` 复制出 `deploy/synology/.env`
2. 把所有默认 secret 改成真实生产值
3. 不要把 Mac 的 `apps/backend/.env` 原样搬过去

## Short version

- Mac 开发真实密钥：`apps/backend/.env.development.local`
- Mac 本机生产参考：`apps/backend/.env.production.reference.local`
- 群晖生产真实密钥：`deploy/synology/.env`
- Git 里只放：`*.env.example`
