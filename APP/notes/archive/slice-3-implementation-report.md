# CODING REPORT

## Task
- Target slice: `Slice 3 — 最小消息流程`
- Goal: 在现有 auth + group/member 基线上，补齐 message create/list、message persistence、浏览器群组会话视图、browser text send flow，并锁定 `text` / `image` / `file` 单类型消息约束。

## Status
- COMPLETED

## Changed files
- `30-build/apps/backend/prisma/schema.prisma`
- `30-build/apps/backend/prisma/migrations/20260325213000_slice3_minimal_message_flow/migration.sql`
- `30-build/apps/backend/src/app.module.ts`
- `30-build/apps/backend/src/messages/dto/create-message.dto.ts`
- `30-build/apps/backend/src/messages/messages.controller.ts`
- `30-build/apps/backend/src/messages/messages.module.ts`
- `30-build/apps/backend/src/messages/messages.service.ts`
- `30-build/apps/frontend/src/App.vue`
- `30-build/apps/frontend/src/components/GroupsWorkspace.vue`
- `30-build/apps/frontend/src/lib/api.ts`
- `30-build/apps/frontend/src/styles.css`
- `30-build/notes/slice-3-implementation-report.md`

## What was implemented
- Prisma 新增 `Message` 模型与 `MessageType` enum，并把消息关联到 `Group` / `User`。
- 后端新增 `GET /api/groups/:groupId/messages` 与 `POST /api/groups/:groupId/messages`。
- message create 服务层强制执行：
  - `text` 只能带非空 `text`
  - `image` / `file` 只能带 `attachment.fileId`
  - 任意 mixed-content payload（如 `text + attachment`）直接拒绝
- message list 仅允许当前群组成员读取，按创建时间正序返回历史。
- 创建消息后会更新群组 `updatedAt`，让群组列表能反映活跃会话。
- 前端群组工作台升级为 Slice 3 workspace：
  - 选中群组后加载并渲染消息历史
  - 提供浏览器内 `text` message 发送表单
  - 对 `image` / `file` message 先以占位卡片渲染，展示已锁定的 file reference contract
- 保持严格 scope：没有引入 search、edit、recall、multi-attachment、mixed message、对象存储上传流程、实时通道或 reminder 改动。

## Acceptance coverage
- `成员可在群组中发送 text message` — COVERED
  - 后端 `POST /groups/:groupId/messages` 支持 `type: "text"`
  - 前端 conversation view 提供 text composer 并调用该接口
- `群组消息历史在浏览器中渲染` — COVERED
  - 前端在选中群组时调用 list endpoint 并渲染 message history
  - text message 直接显示正文，image/file 先显示占位卡片与 `fileId`
- `无效混合内容 payload 被拒绝` — COVERED
  - 服务层对 `text + attachment` / attachment type + text 统一返回 `400 Bad Request`

## Validation
- `npm run prisma:generate --workspace @minimal-im-reminder/backend` — PASS
- `npm run typecheck --workspace @minimal-im-reminder/backend` — PASS
- `npm run typecheck --workspace @minimal-im-reminder/frontend` — PASS
- `npm run build` — PASS
- `cd apps/backend && npx prisma migrate deploy --schema prisma/schema.prisma` — PASS
- `cd apps/backend && node -r ts-node/register prisma/seed.ts` — PASS
- API smoke checks against backend on `PORT=3100` — PASS
  - alice 创建群组并邀请 bob — PASS
  - alice 发送 `text` message — PASS
  - alice 创建 `image` message（`attachment.fileId` contract）— PASS
  - bob 创建 `file` message（`attachment.fileId` contract）— PASS
  - bob 拉取群组消息历史，返回顺序 `text → image → file` — PASS
  - mixed payload `{"type":"text","text":"bad mix","attachment":{"fileId":"file-bad-001"}}` 返回 `400` 且 message 为 `Mixed-content messages are not allowed.` — PASS

## Open issues
- Slice 3 只落了 image/file 的 message contract 与占位渲染；真实上传、文件元数据、可访问 URL 仍属于 Slice 4。
- 当前前端群组工作台仍保留 Slice 2 已有的 unarchive admin 行为；这是既有实现，未在本次扩大范围内继续扩展，但独立 review 时可顺带确认是否需要单独记账。
- 本轮仍以 typecheck/build/API smoke 为主，尚未补自动化 integration/e2e tests。

## Recommended next step
- Hand off to: `review`
- Suggested next action: 对 Slice 3 做独立 review，重点检查 mixed-content rejection、message API contract、以及浏览器 conversation view 是否与 task contract 保持一致。

## Self-review
- Result: PASS
- Checked against:
  - `10-spec/01-spec.md` 4.2 消息模型锁定规则
  - `10-spec/02-task-contract.md` 的 `Slice 3 — 最小消息流程`
  - 用户指派的 strict scope / non-goals / acceptance
- Problems found:
  - 初次运行 `npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma` 时因为未加载 backend `.env`，命令报 `DATABASE_URL` 缺失；改为在 `apps/backend` 目录执行后解决。
  - 本机 `3000` 端口已有其他进程占用，导致一次 smoke backend 启动失败；改用 `PORT=3100` 进行本轮验收。
- Fixes applied:
  - 将 migrate 命令切换到 `apps/backend` 目录，复用已有 `.env`。
  - smoke backend 改用 `PORT=3100`，并完成完整 API 验证。
  - 复核 text / image / file 三种类型都能通过各自合法 payload 创建，mixed payload 会被拒绝。
- Remaining risks:
  - 浏览器 history render 的证据目前主要来自前端代码实现 + build 通过，尚未补浏览器自动化截图或 e2e。
  - image/file 现阶段仅有 file reference contract 与占位渲染，真实文件对象生命周期要等 Slice 4 接上。
