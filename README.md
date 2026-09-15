<div align="center">

# SekerChat

### A self-hosted real-time collaboration workspace for small teams

### 面向小团队的自托管实时协作工作区

Keep channels, direct messages, files, bots, and reminders on infrastructure you control.<br>
把频道、私聊、文件、机器人和提醒放在自己的服务器上。

[![CI](https://github.com/Seker800/SekerChat/actions/workflows/ci.yml/badge.svg)](https://github.com/Seker800/SekerChat/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](./LICENSE)

[Quick Start / 快速开始](#quick-start--快速开始) · [Deployment / 部署](./APP/docs/synology-deployment.md) · [Architecture / 架构](./APP/docs/architecture.md) · [Contributing / 贡献](./CONTRIBUTING.md)

**English · 简体中文**

</div>

![SekerChat workspace / SekerChat 工作区界面](./APP/tests/e2e/workspace.smoke.spec.ts-snapshots/workspace-overview-chromium-darwin.png)

> [!NOTE]
> SekerChat is under active pre-`1.0` development. APIs, deployment procedures, and the data model may change. Please review the deployment and security documentation before running it in production.<br>
> SekerChat 正处于 `1.0` 前的活跃开发阶段，接口、部署流程和数据模型仍可能调整。正式部署前请先阅读部署与安全文档。

## Why SekerChat / 为什么选择 SekerChat

SekerChat gives small teams a complete, self-hosted communication workspace while keeping control of their data and runtime environment. It is more than a chat UI prototype: messages, memberships, file references, and background jobs have explicit persistence boundaries, backed by local development workflows, automated tests, and Synology deployment tooling.

SekerChat 为希望掌控数据和运行环境的小团队提供一套完整、可自托管的沟通工作区。它不只是聊天界面原型：消息、成员关系、文件引用和后台任务都有明确的持久化边界，并配套本地开发、自动化测试与群晖部署流程。

- **Team communication / 团队沟通** — Organize discussions with servers, channels, and direct messages, including real-time messaging, replies, presence, and read progress. / 使用服务器、频道和私聊组织讨论，支持实时消息、回复、成员状态和阅读进度。
- **File collaboration / 文件协作** — Upload images and files to S3-compatible object storage and create controlled external shares. / 通过 S3 兼容对象存储上传图片与文件，并支持受控的外部文件分享。
- **Automation / 自动化能力** — Run bots, reminders, thumbnails, and notifications as retryable jobs without blocking message writes. / 机器人、提醒、缩略图和通知通过可重试任务执行，不阻塞核心消息写入。
- **Data ownership / 数据自主** — Run the frontend, backend, PostgreSQL, and MinIO on your own infrastructure. / 前端、后端、PostgreSQL 与 MinIO 均可运行在自己的基础设施中。
- **Core Chinese and English UI / 核心中英文界面** — Core login and workspace surfaces follow the browser or operating-system language by default, with a persistent override in Personal Settings. / 登录与工作区核心界面默认跟随浏览器或系统语言，也可在个人设置中保存语言偏好。
- **Security boundaries / 安全边界** — Browsers use HttpOnly cookie sessions, while devices and the CLI use separate credential contracts; development and production data planes stay isolated. / 浏览器使用 HttpOnly Cookie 会话，设备与 CLI 使用独立凭据契约；开发环境与生产数据面严格隔离。
- **Maintainable architecture / 可维护架构** — A modular monolith with typed API contracts, a persistent outbox, and automated architecture boundary checks. / 模块化单体、类型化 API 契约、持久化 outbox，以及自动化架构边界检查。

## Architecture / 技术架构

| Layer / 层级            | Implementation / 实现                                       |
| ----------------------- | ----------------------------------------------------------- |
| Web client / Web 客户端 | React, Vite, React Router, TanStack Query, Zustand, i18next |
| Backend / 后端          | NestJS, Prisma, HTTP API, WebSocket                         |
| Data / 数据             | PostgreSQL, MinIO / S3-compatible object storage            |
| Engineering / 工程      | TypeScript, Playwright, Docker Compose, GitHub Actions      |

SekerChat is a modular monolith. PostgreSQL is the source of truth, MinIO stores objects, and WebSocket provides low-latency delivery. Business writes such as messages and their event intent are committed in one database transaction; an outbox worker then handles real-time notifications, bots, and other retryable side effects.

SekerChat 采用模块化单体：PostgreSQL 是业务事实来源，MinIO 保存对象，WebSocket 负责低延迟投递。消息等业务写入与事件意图在同一数据库事务中提交，再由 outbox worker 处理实时通知、机器人和其他可重试副作用。

See the [architecture documentation / 架构文档](./APP/docs/architecture.md) and [architecture decision records / 架构决策记录](./APP/docs/adr) for detailed constraints and flows.

## Quick Start / 快速开始

### Requirements / 环境要求

- Node.js 22
- Docker and Docker Compose / Docker 与 Docker Compose
- npm 10 or later / npm 10 或更高版本

### Start the local environment / 启动本地环境

```bash
git clone https://github.com/Seker800/SekerChat.git
cd SekerChat/APP
npm ci

cp deploy/local-dev/.env.example deploy/local-dev/.env
cp apps/backend/.env.example apps/backend/.env.development.local

docker compose --env-file deploy/local-dev/.env \
  -f deploy/local-dev/docker-compose.yml up -d

npm run prisma:generate --workspace @sekerchat/backend
npm run prisma:migrate --workspace @sekerchat/backend
npm run dev:backend
```

Start the frontend in another terminal / 在另一个终端启动前端：

```bash
cd SekerChat/APP
npm run dev:frontend
```

Open [http://localhost:5173](http://localhost:5173). For environment variables, login preparation, and troubleshooting, see the [local development runbook / 本地开发手册](./APP/docs/local-dev-runbook.md).

## Deployment / 部署

The maintained production model runs the frontend, backend, PostgreSQL, and MinIO on a Synology NAS. Application releases and database migrations are separate operations, and production secrets remain only on the deployment host.

当前维护的生产模型是在群晖 NAS 上运行 frontend、backend、PostgreSQL 和 MinIO。应用发布与数据库迁移是相互独立的操作，生产密钥只保存在部署主机上。

- [Environment model / 环境模型](./APP/docs/environment-model.md)
- [Synology deployment runbook / 群晖部署手册](./APP/docs/synology-deployment.md)
- [Secret storage guide / 密钥存储指南](./APP/docs/secret-storage-guide.md)

Before publishing your own fork, replace the example domains, identity providers, administrator accounts, and credentials. Never reuse development secrets in production.

发布自己的 fork 前，请替换示例配置中的域名、身份提供方、管理员账户和凭据，不要复用任何开发环境密钥。

## Repository Structure / 仓库结构

```text
SekerChat/
├── APP/
│   ├── apps/
│   │   ├── backend/          # NestJS API and background jobs / 后台任务
│   │   ├── frontend-react/   # React web client / Web 客户端
│   │   └── reminder/         # Standalone reminder client / 独立提醒客户端
│   ├── packages/             # Shared types and API contracts / 共享类型与契约
│   ├── deploy/               # Local and Synology deployment / 本地与群晖部署
│   ├── docs/                 # Architecture and operations docs / 架构与运维文档
│   └── tests/                # Playwright end-to-end tests / 端到端测试
├── CONTRIBUTING.md
├── SECURITY.md
└── LICENSE
```

## Development and Validation / 开发与验证

```bash
cd APP
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run architecture:check
npm run open-source:check
npm run security:audit:ci
```

For web UI changes, also run `npm run review:web` to check critical flows and visual snapshots. See the [application workspace guide / 应用工作区说明](./APP/README.md) for the full command and test boundaries.

Web 界面改动还应运行 `npm run review:web`，检查关键流程与视觉快照。完整命令和测试边界见[应用工作区说明](./APP/README.md)。

## Documentation / 文档

- [Documentation index / 文档索引](./APP/docs/README.md)
- [Local development runbook / 本地开发手册](./APP/docs/local-dev-runbook.md)
- [HTTP API contract / HTTP API 契约](./APP/docs/http-api-contract.md)
- [Realtime event contract / 实时事件契约](./APP/docs/realtime-contract.md)
- [Open-source release process / 开源发布流程](./APP/docs/open-source-release.md)
- [Dependency risk register / 已登记的依赖风险](./APP/docs/dependency-risk-register.md)

## Contributing / 参与贡献

Issues and pull requests are welcome. Please read the [contribution guide / 贡献指南](./CONTRIBUTING.md) first and keep each change focused on one cohesive problem. Behavior changes require corresponding tests, and UI changes require visible-result validation.

欢迎提交 Issue 和 Pull Request。开始之前请阅读[贡献指南](./CONTRIBUTING.md)，并让一次变更只解决一个内聚问题。行为变更需要相应测试，界面变更需要可见结果验证。

Report security issues privately according to the [security policy / 安全策略](./SECURITY.md). Do not disclose vulnerabilities, credentials, or user data in public issues.

发现安全问题时，请按照[安全策略](./SECURITY.md)私下报告，不要在公开 Issue 中披露漏洞、凭据或用户数据。

## License / 许可证

SekerChat is licensed under the [GNU Affero General Public License v3.0](./LICENSE) (`AGPL-3.0-only`).

SekerChat 源代码采用 [GNU Affero General Public License v3.0](./LICENSE)（`AGPL-3.0-only`）许可。

Third-party content and assets with separate source or usage restrictions are not automatically covered by this license. Check the source and license notices in the relevant directories before use or redistribution.

第三方内容以及带有独立来源或使用限制说明的素材不自动包含在该授权中；使用或再分发前，请以对应目录内的来源与许可说明为准。
