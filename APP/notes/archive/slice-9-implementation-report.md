# CODING REPORT

## Task
- Target slice: `Slice 9 — V1 加固和 Admin 规则`
- Goal: 只实现 leave-group 后 group/history/file 访问撤销的收口、archive-group 行为、提醒失败与 delivery-path 日志、基本错误处理与可观测性、以及 V1 manual verification notes；不扩展到通知偏好系统、分析平台或额外平台集成。

## Status
- IMPLEMENTED
- Current session note: Slice 9 的代码改动、workspace typecheck 与 build 已完成；fresh backend-backed runtime verification 仍被当前 session 的本地 API / PostgreSQL 不可达所阻塞，因此本报告把 live validation 缺口和手动验证步骤都明确记录下来，而不是假装已完成。

## Changed files
- `30-build/apps/backend/src/common/http-exception.filter.ts`
- `30-build/apps/backend/src/common/request-logging.interceptor.ts`
- `30-build/apps/backend/src/main.ts`
- `30-build/apps/backend/src/groups/groups.service.ts`
- `30-build/apps/backend/src/files/files.service.ts`
- `30-build/apps/backend/src/messages/messages.service.ts`
- `30-build/apps/reminder/src/index.ts`
- `30-build/apps/frontend/src/components/GroupsWorkspace.vue`
- `30-build/apps/frontend/src/App.vue`
- `30-build/notes/slice-9-implementation-report.md`

## What was implemented
### Backend access hardening and archive behavior
- backend 继续沿用“仅当前群组成员可读，archived group 只读”的 contract，但把 Slice 9 需要观察的失败路径明确打到日志里：
  - `group_access_denied`
  - `group_write_denied_archived`
  - `file_access_denied`
  - `file_write_denied`
  - `message_access_denied`
  - `message_write_denied`
- `GroupsService` 现在对 `group_created`、`group_member_invited`、`group_member_removed`、`group_archived`、`group_unarchived` 记录结构化日志，便于追踪 leave-group / archive 操作本身。
- `archiveGroup(...)` 在 archive / unarchive 时显式刷新 `updatedAt`，避免 archive 状态变化在 group 列表排序和最近活动时间上表现含糊。
- `FilesService` 和 `MessagesService` 对“非成员访问”和“archived group 写入”继续强制拒绝，并补充 upload / stream / message creation 的关键日志，保证 leave-group 后历史、消息附件元数据与文件内容都保持由 membership gate 控制。

### Basic error handling and observability
- 新增全局 `RequestLoggingInterceptor`，对成功完成的 HTTP 请求记录 `method + url + status + userId + durationMs + ip`。
- 新增全局 `HttpExceptionLoggingFilter`，对 4xx/5xx 失败请求记录 `method + url + status + userId + ip + message`，使主要失败原因在 backend 日志中可见。
- 这些全局日志与 slice 内的 domain logs 叠加后，可以把一次失败区分为：
  - request 级失败
  - access rule 拒绝
  - archived read-only 拒绝
  - 文件上传 / 文件读取失败
  - 消息创建与 reminder delivery 相关事件

### Reminder delivery-path and failure-path logs
- reminder CLI 现在对 `request-code` 和 `login` 失败分别记录：
  - `request_code_failed`
  - `login_failed`
- reminder runtime 在运行生命周期内新增 / 强化日志：
  - `runtime_started`
  - `runtime_stopped`
  - `fallback_pull_failed`
  - `delivery_failed`（按 `sound` / `notification` / `open` 分 stage）
  - `delivery_path`（标记本次消息实际走过的 `sound` / `notification` / `open` 路径）
- 既有的 `ws_connect`、`ws_disconnect`、`ws_reconnect`、`ws_error`、`fallback_pull`、`notify_skipped`、`notify_shown`、`browser_open` 继续保留，因此 Slice 9 后可以更直接回答：
  - 有没有收到事件
  - 走的是 websocket 还是 fallback
  - 为什么跳过
  - 声音/通知/打开浏览器分别在哪一步失败

### Frontend revocation/archive UX tightening
- `GroupsWorkspace.vue` 的 group refresh 逻辑现在会先校验“当前 URL / 当前选中群组是否仍在最新 group list 中”。
- 如果当前用户已被移出群组，前端不再死守一个已失效的 `groupId`，而是：
  - 自动回退到仍可访问的第一个群组，或
  - 在无可访问群组时清空当前会话
  - 同时给出 `Your previous group selection is no longer available.` / `Group access is no longer available.` 这类明确提示
- 当直接访问一个已被撤销访问权的群组详情时，前端会在收到 `Group access denied.` 后触发 `refreshGroups()` 收口，而不是停在过期状态。
- App 首页标题文案同步更新到 Slice 9，避免仍显示 Slice 7 的旧阶段说明。

## Acceptance coverage
- `被移除用户失去群组/历史/文件访问` — COVERED BY IMPLEMENTATION
  - backend 的 group/message/file 读取路径继续统一走 membership gate
  - frontend 对当前会话失效时增加自动回退和清空收口
- `核心提醒闭环在重复手动测试中端到端工作` — IMPLEMENTED WITH MANUAL-VERIFICATION NOTES
  - 本轮代码把失败/路径日志补齐，便于 V1 验证
  - fresh live proof 仍需在 API + DB 可达环境里补跑
- `主要失败原因在日志中可见` — COVERED BY IMPLEMENTATION
  - backend request / exception / domain logs
  - reminder runtime 的 connection / fallback / delivery / browser-open logs

## Validation
### Static validation
- `npm run typecheck` — PASS
- `npm run build` — PASS

### Environment-blocked runtime validation
- `curl -sf http://localhost:3000/api` — FAILED
  - `curl` exit code `7`
- `curl -sf http://localhost:3001/api` — FAILED
  - `curl` exit code `7`
- `set -a && source apps/backend/.env && set +a && npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma` — FAILED
  - `P1001: Can't reach database server at localhost:5432`

## V1 manual verification notes
### 1. Leave-group revocation
- 使用 admin 用户与 member 用户登录 browser。
- admin 创建群组、发送至少一条文本消息，并上传一个 image/file。
- member 在浏览器中确认：
  - 可打开群组详情
  - 可读取消息历史
  - 可下载/查看文件
- admin 执行 remove member。
- 期望结果：
  - member 再次请求该群组详情时收到 `Group access denied.`
  - member 再次请求消息历史时收到 `Group access denied.`
  - member 再次请求文件 metadata / content 时收到 `Group access denied.`
  - frontend 若仍停留在旧群组 URL，会自动回退到仍可访问的群组或清空当前会话
- 关键日志：
  - backend `group_member_removed`
  - backend `group_access_denied` / `message_access_denied` / `file_access_denied`

### 2. Archive-group behavior
- admin 对一个现有群组执行 archive。
- 期望结果：
  - group 仍可列出和查看历史
  - invite / remove / send message / upload attachment 被拒绝
  - 错误消息为 `Archived group is read-only.`
  - unarchive 后上述写操作恢复
- 关键日志：
  - backend `group_archived` / `group_unarchived`
  - backend `message_write_denied` / `file_write_denied` / `group_write_denied_archived`

### 3. Reminder delivery-path and failure logs
- 使用 `REMINDER_DISABLE_SIDE_EFFECTS=1` 先跑一轮，确认 runtime 能稳定输出：
  - `runtime_started`
  - `ws_connect`
  - `event_received`
  - `delivery_path`
  - `notify_shown`
- 然后在真实 side effects 环境下验证：
  - 普通消息至少出现 `sound` 路径
  - mention / reply 至少出现 `sound` + `notification`
  - 若开启 `REMINDER_AUTO_OPEN_LEVEL2=1`，还应出现 `browser_open`
- 如果故意制造失败：
  - 登录失败应见 `login_failed`
  - fallback pull 请求失败应见 `fallback_pull_failed`
  - 声音 / 通知 / browser open 失败应见 `delivery_failed`

### 4. End-to-end V1 reminder loop
- 准备两名用户：一名发送者，一名安装并登录 reminder 的接收者。
- 在接收者浏览器关闭或不聚焦情况下，由发送者发一条普通消息，再发一条 `@receiver` 或 reply receiver 的消息。
- 期望结果：
  - 普通消息触发 Level 1 声音
  - mention / reply 触发 Level 2 声音 + 通知
  - 点击通知打开 `/groups/:groupId`
  - 相关日志可串出完整链路：`event_received -> delivery_path -> notify_shown -> browser_open`

## Open issues
- 本轮没有新增 schema / migration；Slice 9 聚焦的是行为收口和 observability，不需要再扩数据库模型。
- 当前 session 内仍无法证明 fresh backend-backed runtime：
  - 本地 API `localhost:3000` / `localhost:3001` 不可达
  - PostgreSQL `localhost:5432` 不可达
- 因此，Slice 9 现在是“实现完成 + 静态校验通过 + live verification env-blocked”的状态，不应被误写成已在本 session 内完成全套运行时证明。

## Recommended next step
- Hand off to: `review`
- review 建议重点检查：
  1. backend 的全局 request/error logging 是否足够基础且不越界到企业级监控
  2. leave-group 后 group/history/file 三类读取路径是否都仍然被 membership gate 收紧
  3. archive-group 是否保持“可读、不可写”的明确行为
  4. reminder delivery-path / failure-path logs 是否能覆盖 `login -> ws -> pull -> notify -> open`
  5. frontend 对 revoked current group 的自动回退是否仅做 Slice 9 收口，而没有引入新的偏好/导航系统

## Self-review
- Result: PASS WITH ENV-BLOCKED LIVE VALIDATION
- Checked against:
  - `10-spec/01-spec.md` 中 4.1 / 8.2 / 9.2 / 11
  - `10-spec/02-task-contract.md` 中 Slice 9 scope / non-goals / acceptance
  - `10-spec/04-implementation-notes.md` 中日志规范与 cursor/reminder 相关注意点
  - `30-build/notes/slice-8-implementation-report.md`
  - `40-review/reports/2026-03-26-slice-8-review-report.md`
- Problems found:
  - 当前 session 内 backend API 与 PostgreSQL 仍然不可达，因此无法补一轮 fresh live smoke
  - frontend 在本轮之前对“当前选中群组已被移除”缺少收口，容易停留在无效 groupId 上
- Fixes applied:
  - 新增 backend 全局 request / exception 日志
  - 为 group / file / message / archive / reminder delivery 关键路径补结构化日志
  - 为 frontend 增加 revoked group 自动回退 / 清空逻辑
- Remaining risks:
  - Slice 9 的 live proof 仍需在“API 可访问 + DB 可访问”的环境里补跑
  - backend 当前日志仍是应用内结构化 stdout，不是持久化监控系统；这符合 Slice 9 scope，但不应被误解成更高级的 observability 平台
