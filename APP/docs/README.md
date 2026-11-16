# Docs

这里是当前工程的文档入口。历史发布记录仍然保留，但**当前真相以架构、契约和运行手册为准**。

## 先读这四份

1. [Architecture](./architecture.md) — 模块方向、数据与事件规则、主流程
2. [Environment Model](./environment-model.md) — 生产与开发两套环境的边界
3. [Local Dev Runbook](./local-dev-runbook.md) — 本机启动、数据库、排障
4. [Synology Deployment](./synology-deployment.md) — 生产部署与回滚

## 术语

先读 [ADR 0008 词汇与命名](./adr/0008-vocabulary-and-naming.md)。一句话版本：

- `Server` = 服务器，稳定身份；`Group` = 频道；`Channel` 只出现在用户文案里。
- `Category` 是迁移期兼容字段，新代码不要继续使用。
- `出勤 / 月报 / 文章 / 相册` 是独立工具页，不属于私聊（历史原因曾放在 `/dm/` 下）。

## 代码地图

后端 `apps/backend/src/`：

| 区域 | 入口 | 说明 |
|---|---|---|
| 应用装配 | `app.module.ts` | 30 个模块的总清单 |
| 消息 | `messages/messages.controller.ts` → `messages/messages.service.ts` | 发送、编辑、撤回、历史分页 |
| 实时 | `realtime/realtime.controller.ts`、`realtime/realtime.service.ts` | WebSocket 与拉取接口 |
| 可靠事件 | `outbox/` | 事务内写入、至少一次投递、去重 |
| 上传 | `uploads/uploads.controller.ts` → `uploads.service.ts` | 分片上传、完成、恢复、清理 |
| 服务器与频道 | `servers/`、`groups/` | 服务器身份、频道成员与查询 |
| 出勤 | `attendance/` | 打卡、投影、月报、重算 |
| 文章 | `subscriptions/` | 发布、浏览记录、附件 |
| 相册 | `album/` | 照片、标签、媒体任务 |
| 扩展 | `extensions/qq-bridge/` | QQ 桥接，默认关闭 |

前端 `apps/frontend-react/src/`：

| 区域 | 入口 | 说明 |
|---|---|---|
| 启动 | `main.tsx` → `App.tsx` | 路由与登录边界 |
| 工作区 | `components/workspace/WorkspaceShell.tsx` | 四区布局：服务器栏 / 频道栏 / 消息栏 / 信息栏 |
| 视图模型 | `components/workspace/useWorkspaceShellModel.ts` | 工作区状态组合层 |
| 消息流 | `components/workspace/MessagePane.tsx` → `MessageList.tsx` → `MessageItem.tsx` | 虚拟列表、滚动锚点、右键菜单 |
| 数据访问 | `lib/*-api.ts` | 所有 HTTP 调用；认证统一走 `lib/api-core.ts` |
| 本地状态 | `store/workspace-store.ts` | 仅存 UI 草稿、隐藏会话、待发送计数 |
| 实时 | `hooks/useRealtime.ts` | 事件解析与查询失效 |

共享包：

- `packages/contracts` — OpenAPI 生成类型与实时事件契约
- `packages/shared` — 权限、工作状态等前后端共用常量

## 新人第一天路线

1. 读 [Architecture](./architecture.md) 的 North star、主流程、刷新归属三节。
2. 打开 `apps/backend/src/app.module.ts`，扫一遍模块名。
3. 跟一次发送：`messages.controller.ts` → `messages.service.ts` 的 `createMessage`。
4. 打开 `WorkspaceShell.tsx`，只读 JSX 结构，先不要展开 `model`。
5. 读 `lib/api-core.ts`，搞清 cookie 认证与 401 刷新；此后所有 `accessToken` 参数都可以忽略。
6. 跑一遍 `npm run dev:backend` 与 `npm run dev:frontend`，用真实 UI 走一次发消息。

## 文档索引

**架构与契约**
- [Architecture](./architecture.md)
- [HTTP API Contract](./http-api-contract.md)
- [Realtime Contract](./realtime-contract.md)
- [API Capabilities Guide](./api-capabilities-guide.md)
- [Auth Client Contracts](./auth-client-contracts.md)
- [Message History Scroll State Machine](./message-history-scroll-state-machine.md)

**运行与部署**
- [Environment Model](./environment-model.md)
- [Local Dev Runbook](./local-dev-runbook.md)
- [Synology Deployment](./synology-deployment.md)
- [Secret Storage Guide](./secret-storage-guide.md)
- [Database Migration Runbook](./database-migration-runbook.md)
- [Open-source Release Runbook](./open-source-release.md)
- [Dependency Branch Integration](./dependency-branch-integration.md)
- [Dependency Risk Register](./dependency-risk-register.md)

**功能与边界**
- [Bot User Boundary](./bot-user-boundary.md)
- [Group Notifications](./group-notifications.md)
- [Network Reminder](./network-reminder.md)
- [QQ Bridge](./qq-bridge.md)
- [Desktop Pet](./desktop-pet.md)
- [Clipboard Paste](./clipboard-paste.md)
- [Download Diagnostics](./download-diagnostics.md)
- [Public File Share Security](./public-file-share-security.md)
- [Auxiliary Data Retention](./auxiliary-data-retention.md)
- [Reminder Device Credentials](./reminder-device-credentials.md)
- [Workspace Sidebar Notes](./workspace-sidebar-agent-notes.md)
- [Server Identity Migration](./server-identity-migration.md)

**决策记录**
- [ADR 目录](./adr)

**历史记录（不是当前真相）**
- `production-release-v0.9.*.md`、`version-notes-*.md`、`release-preflight-*.md`、`performance-follow-up-*.md`、`prod-dev-sync-idea.md`
- 早期 slice 的实现报告与 runner 脚本在 `../notes/archive/`

## 提交规范

见 [Commit 规范](./Commit规范.md)。
