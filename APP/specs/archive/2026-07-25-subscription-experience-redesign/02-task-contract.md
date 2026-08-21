# 02-task-contract.md

## Contract Rules

- 测试先于生产代码，先验证 RED。
- 每个 slice 都产生可验证输出。
- 不扩大到富文本、图片处理或 RSS 抓取。

## Status

ARCHIVED

## Archive Plan

- Former active location: `APP/specs/subscription-experience-redesign/`
- Archive location: `APP/specs/archive/2026-07-25-subscription-experience-redesign/`
- Closeout trigger: 所有 completion checks 通过并完成本地提交。

## Task Objective

重构订阅内容模型、列表详情层级、Markdown 编辑阅读和正文图片插入体验。

## In-scope Changes

- Prisma 迁移和订阅 API 合同。
- Markdown 安全渲染与附件图片解析。
- 列表、详情、标签编辑和发布编辑器。
- 单元、服务与 Playwright 验证。

## Out-of-scope Changes

- 图片专属限制、图像处理和远程图片加载。
- 无关工作区布局重构。
- 生产部署或生产数据写入。

## Target Modules / Files

- `apps/backend/prisma/*`
- `apps/backend/src/subscriptions/*`
- `apps/frontend-react/src/lib/subscriptions-api.ts`
- `apps/frontend-react/src/components/workspace/DmSubscription*`
- `tests/e2e/*`

## Required Implementation Points

- 旧字段无损迁移后再删除。
- 列表和详情使用不同响应结构。
- `attachment://` 只能解析当前内容的图片附件。
- Markdown 原始 HTML关闭，危险链接不可点击。
- 标签解析去空、去重并继续服从数量和长度校验。

## Key Locked Decisions

- 无类型、无手工摘要、无独立外链。
- Markdown 正文是唯一内容源。
- 图片统一使用现有附件限制，没有图片专属限制。

## Validation Steps

- 后端 DTO、迁移和列表预览测试。
- 前端 Markdown、标签、列表详情和插图测试。
- Prisma validate、generate、migrate status。
- 全仓 lint、typecheck、test、build。
- Playwright 订阅关键流程与截图复核。

## Completion Checks

- [x] RED 检查点已验证和提交。
- [x] 后端合同和迁移完成。
- [x] 前端阅读和发布闭环完成。
- [x] 安全复核无阻塞项。
- [x] 全部验证通过。
- [x] 只提交任务文件。

## Closeout Notes

- Delivered: 精简订阅数据模型，完成轻量列表、Markdown 详情、标签编辑、正文插图和统一附件上传下载。
- Remaining: 无。
- Evidence: lint、typecheck、后端 178 个测试、前端 155 个测试、生产构建和 Playwright 14 个 smoke 均通过；本机开发库 50 个迁移为最新状态。
- Archive decision: ARCHIVED_AFTER_IMPLEMENTATION_COMMIT

## Rollback / Caution Notes

- 不操作群晖生产数据。
- 不提交 `APP/apps/desktop-shell/`。
- 不自动 push。

---

## Slice 1 — 合同与 RED

### Goal

用失败测试锁定新内容模型和用户体验。

### Acceptance

- [x] 失败原因来自旧实现仍暴露类型、摘要、外链或缺少 Markdown/详情/插图。

## Slice 2 — 后端合同与迁移

### Goal

无损迁移旧数据并提供列表预览、完整详情和统一输入合同。

### Acceptance

- [x] 后端目标测试、Prisma 和构建通过。

## Slice 3 — Markdown 阅读与发布

### Goal

完成列表、详情、标签、编辑预览和正文图片。

### Acceptance

- [x] 前端目标测试和关键用户流程通过。

## Slice 4 — 集成与收口

### Goal

完成全量验证、安全审查、视觉复核、归档和提交。

### Acceptance

- [x] Completion checks 全部满足。
