# CODING REPORT

## Task
- Target slice: `Slice 4 — 对象存储集成`
- Goal: 在 Slice 3 消息模型不改型的前提下，接入 S3-compatible 对象存储，落地 image/file 上传流程、文件元数据持久化、受控访问路径，以及浏览器侧 image/file message 渲染路径。
- Rework trigger: 独立 review 发现 `contentUrl` 仍是 bearer URL，`GET /api/file-access/:token` 没有按当前请求者身份做鉴权，导致泄漏 URL 可被非成员复用。

## Status
- REWORK COMPLETED
- Slice 4 仍处于 `in_progress`，本报告仅说明 blocking rework 已完成，**不在此标记 slice done**。

## Changed files
- `30-build/apps/backend/src/files/files.controller.ts`
- `30-build/apps/backend/src/files/files.module.ts`
- `30-build/apps/backend/src/files/files.service.ts`
- `30-build/apps/backend/src/messages/messages.service.ts`
- `30-build/apps/frontend/src/components/GroupsWorkspace.vue`
- `30-build/apps/frontend/src/lib/api.ts`
- `30-build/notes/slice-4-implementation-report.md`

## What changed for the rework
### Backend access model
- 删除匿名 bearer-style 内容出口 `GET /api/file-access/:token`。
- 将文件内容读取改为受保护成员路径：`GET /api/groups/:groupId/files/:fileId/content`。
- 该内容路径现在走 `JwtAuthGuard`，并在 `FilesService.getFileStream(userId, groupId, fileId)` 中按**当前认证请求者**执行群组成员校验。
- `contentUrl` 不再嵌入 JWT，也不再把 URL 自身当作授权凭证；它只是一个需要当前用户认证上下文的后端文件内容地址。

### Frontend browser rendering path
- 因为浏览器的 `<img src>` / 普通下载链接不会自动附带当前 Bearer token，前端改为：
  - image message：通过带 `Authorization` 头的 `fetch` 拉取受保护内容，再创建 blob URL 供 `<img>` 渲染。
  - file message：点击下载时通过带 `Authorization` 头的 `fetch` 拉取 blob，再触发浏览器下载。
- 保持 Slice 4 的消息契约不扩展：消息仍然只暴露 `attachment.contentUrl`，只是该 URL 现在必须在认证上下文下使用。

### Scope control
- 未改动 Slice 4 之外的产品决策。
- 未引入未来 slice 的 ticket store、一次性票据、cookie session bridge、ACL redesign 或生命周期任务。
- 仅把 blocker 从“URL bearer 授权”收紧为“当前请求者成员鉴权”。

## Current implementation summary
- Prisma `FileObject` 模型、S3-compatible 上传流程、文件元数据持久化、image/file message 约束与前端最小上传 UI 仍保留。
- `MessagesService` 继续强制：
  - one-type-per-message
  - `image` 只能引用 image MIME 文件
  - `file` 只能引用非 image 文件
  - attachment 必须属于当前群组
- 浏览器现在仍可：
  - 上传 image/file
  - 发送 image/file message
  - 渲染受保护 image message
  - 下载受保护 file message

## Blocker coverage
### Blocking issue: leaked/existing URL could be reused without current requester check
- **FIXED**
- 旧问题：`contentUrl` 自带 JWT，服务端只验证 token claims，不验证当前 HTTP 请求者。
- 现在：文件内容读取必须同时满足：
  1. 请求者已认证
  2. 请求者当前仍是该 group 成员
  3. 文件确实属于该 group
- 结果：
  - 成员正常访问仍可用
  - 非成员拿到旧 URL 也无法直接读
  - 被移除成员拿旧 URL 也会被拒绝
  - image/file 浏览器路径仍保留

## Acceptance coverage after rework
- `用户可上传 image/file` — COVERED
- `浏览器可渲染 image message 和访问文件元数据` — COVERED
- `非成员无法通过正常应用路径访问群组文件资源` — COVERED
- 本轮 rework 额外覆盖 review blocker：**existing leaked URL 不再作为 bearer secret 生效**

## Validation evidence
### Static validation
- `npm run typecheck --workspace @minimal-im-reminder/backend` — PASS
- `npm run typecheck --workspace @minimal-im-reminder/frontend` — PASS
- `npm run build` — PASS

### Runtime validation
- `npx prisma migrate deploy --schema prisma/schema.prisma`（`apps/backend`）— PASS
- `node -r ts-node/register prisma/seed.ts`（`apps/backend`）— PASS
- 本地 `s3rver` + backend(`PORT=3140 API_BASE_URL=http://127.0.0.1:3140`) smoke — PASS

### Focused blocker smoke evidence
使用同一个已签发的旧 `contentUrl` 路径进行验证：
- alice 创建 group 并上传 PNG，再创建 `image` message — PASS
- 取回历史消息中的 `attachment.contentUrl`（现为 `/api/groups/:groupId/files/:fileId/content`）— PASS
- **匿名请求** 直接访问该 URL — `401`（PASS）
- **bob 已认证但尚未加入该 group**，复用同一 URL — `403`（PASS）
- 邀请 bob 入组后，bob 复用同一 URL — `200 image/png`，返回真实字节（PASS）
- 将 bob 移出群组后，bob 再次复用同一 URL — `403`（PASS）

### Browser-path smoke evidence
- 受保护 file 路径额外验证：
  - alice 上传 TXT 并创建 `file` message — PASS
  - 以带 `Authorization` 头的 fetch 访问 `attachment.contentUrl` — `200 text/plain`，返回正确文本内容（PASS）
- 结合前端本轮实现：
  - image 使用 auth fetch + blob URL 渲染
  - file 使用 auth fetch + blob 下载
  - frontend typecheck/build 通过，说明浏览器路径代码已闭环

## Open issues
- 依然存在两步式 `upload -> createMessage` 流程；如果第二步失败，仍可能留下 orphan `FileObject`。这已是原 Slice 4 已知问题，不属于本 blocker rework 范围。
- 仍未增加自动化 browser e2e；当前以 focused runtime smoke + typecheck/build 作为本轮验证证据。
- `FILE_ACCESS_SECRET` / `FILE_ACCESS_TTL` 环境项目前仍留在配置中，但新内容读取路径已不再依赖 bearer URL。它们现在属于可后续清理的遗留配置，不影响本 blocker 是否修复。

## Explicit self-review
- Result: PASS
- Self-review question: “现在的文件读取是否严格由**当前认证请求者**决定，而不是由 URL 内嵌凭证决定？”
- Answer: YES
- Checked against:
  - `10-spec/01-spec.md` 4.1 / 4.7 / 8.2
  - `10-spec/02-task-contract.md` 中 Slice 4 acceptance
  - `40-review/reports/2026-03-25-slice-4-review-report.md` 的 blocking finding
- Why pass:
  - 后端内容读取已经绑定到当前请求者身份
  - 独立 smoke 证明匿名、非成员、已移除成员都不能复用旧 URL
  - 浏览器 image/file 路径仍可通过认证 fetch 工作

## Recommended next step
- Hand off to: `review`
- Suggested next action: 做 Slice 4 独立复核，重点只看这次 blocker rework：
  - 是否完全消除 bearer URL 读文件路径
  - 是否所有内容读取都绑定到当前认证请求者
  - 前端 image/file 浏览器路径是否仍能正常工作
