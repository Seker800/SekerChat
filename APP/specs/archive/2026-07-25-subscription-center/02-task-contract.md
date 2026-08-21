# 02-task-contract.md

## Contract Rules

- 每个 slice 都产生可验证输出。
- 按依赖顺序推进，不提前实现未来 slice。
- 测试先于生产代码，RED 后进入实现。
- 发现本合同之外的关键歧义时停止扩张范围。

## Status

COMPLETED

## Archive Plan

- Active location: `APP/specs/subscription-center/`
- Archive location: `APP/specs/archive/2026-07-25-subscription-center/`
- Closeout trigger: 所有 completion checks 满足并完成本地提交。

## Task Objective

交付私信工作区“订阅”V1，包括内容管理、5 GB multipart 附件、鉴权下载、未读和实时更新。

## In-scope Changes

- Prisma 模型与迁移。
- 共享权限与上传类型。
- 后端订阅 API、存储、上传完成、下载和实时事件。
- 前端特殊页面路由、列表、筛选、发布管理和附件交互。
- 单元、集成与 E2E 验证。

## Out-of-scope Changes

- RSS 抓取、定时发布、评论、收藏、外部推送和自动升级。
- 无关工作台样式重构。
- 群晖生产部署和生产数据修改。

## Target Modules / Files

- `apps/backend/prisma/schema.prisma`
- `apps/backend/prisma/migrations/*`
- `packages/shared/src/permissions.ts`
- `apps/backend/src/subscriptions/*`
- `apps/backend/src/uploads/*`
- `apps/backend/src/realtime/*`
- `apps/frontend-react/src/lib/subscriptions-api.ts`
- `apps/frontend-react/src/store/workspace-store.ts`
- `apps/frontend-react/src/components/workspace/*Subscription*`
- `apps/frontend-react/src/components/workspace/ChannelSidebar.tsx`
- `apps/frontend-react/src/components/workspace/WorkspaceShell.tsx`
- `tests/e2e/*`

## Required Implementation Points

- 服务端强制管理权限、内容状态、附件数量和 5 GB 大小限制。
- 草稿发布事务重新校验附件均已完成。
- 下载响应支持 Range、Content-Disposition 和鉴权。
- 用户正文不渲染任意 HTML，外链协议使用白名单。
- 哈希流式计算，不能把大文件载入内存。
- 实时断线重连后主动刷新订阅摘要与列表。

## Key Locked Decisions

- 页面名称为“订阅”。
- 默认上限为 5 GB。
- 最多 5 个附件。
- 所有登录用户可读已发布内容。
- `manage_subscription_posts` 控制管理能力。

## Validation Steps

- 后端订阅和上传服务单测。
- 前端页面和特殊页面导航单测。
- Prisma validate、generate、migrate status。
- 前后端 typecheck、test、build。
- 工作区 Playwright smoke 与订阅关键流程。
- 浏览器截图验证频道栏、消息栏和信息栏。

## Completion Checks

- [x] 数据模型和迁移完整。
- [x] API 与权限边界完整。
- [x] 上传下载完整。
- [x] 前端闭环完整。
- [x] 所有要求的验证通过。
- [x] 安全复核无阻塞项。
- [x] 本地提交存在且不包含用户无关文件。

## Closeout Notes

- Delivered: 私信订阅中心、三类内容管理、5 GB multipart 附件、鉴权下载、未读与实时刷新。
- Remaining: V1 范围内无剩余项；RSS 自动抓取、定时发布等继续保留在非目标范围。
- Evidence: 后端 177 项测试、前端 147 项测试、工作区 13 项 Playwright、lint、全仓 typecheck/build、Prisma validate/status 均通过；订阅与频道栏截图已人工复核。
- Archive decision: ARCHIVE

## Rollback / Caution Notes

- 不删除或重建生产数据容器。
- 不把 `APP/apps/desktop-shell/` 的用户未跟踪文件纳入提交。
- 不自动 push。

---

## Slice 1 — 合同与 RED 测试

### Goal

锁定行为并证明当前实现缺失。

### Scope

- 落 spec、合同和关键后端/前端测试。
- 执行测试并确认预期 RED。

### Input

- 已确认的功能清单。
- 现有工作区、上传和权限实现。

### Output

- 可执行合同。
- 因订阅实现缺失而失败的测试。

### Non-goals

- 不修改业务生产代码。

### Acceptance

- [x] RED 原因来自订阅功能缺失。

## Slice 2 — 后端领域与存储

### Goal

完成数据、权限、内容生命周期和附件闭环。

### Scope

- Prisma、订阅模块、上传适配、下载和实时事件。

### Input

- Slice 1 测试与合同。

### Output

- 通过后端目标测试的 API。

### Non-goals

- 不实现前端 UI。

### Acceptance

- [x] 后端目标测试、类型检查和迁移校验通过。

## Slice 3 — 前端订阅工作台

### Goal

完成用户可见的阅读、未读、发布和附件操作。

### Scope

- 快捷页面、消息栏、信息栏、发布编辑器和 multipart 客户端。

### Input

- Slice 2 API。

### Output

- 可交互订阅 V1。

### Non-goals

- 不加入 V2 功能。

### Acceptance

- [x] 前端测试、类型检查和构建通过。

## Slice 4 — 集成、视觉与收口

### Goal

证明端到端行为符合合同并安全提交。

### Scope

- 本地迁移、E2E、截图、安全复核、文档和提交。

### Input

- Slice 2、3 完整实现。

### Output

- 验证证据和本地提交。

### Non-goals

- 不部署生产、不 push。

### Acceptance

- [x] Completion checks 全部满足。
