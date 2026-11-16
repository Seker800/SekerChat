# CODING REPORT

## Task
- Target slice: `Slice 6 — 提醒进程最小运行时`
- Goal: 在 Slice 5 realtime 基线之上，仅实现最小 reminder runtime：独立 reminder 进程、独立登录/device token、提醒进程认证 WebSocket 连接与自动重连；不提前实现 Slice 7 提醒强度/通知闭环或 Slice 8 fallback pull。

## Status
- IMPLEMENTED
- Current session note: 代码实现已落地，静态验证通过；后续在本机实际拉起 backend（`http://localhost:3001/api`）并补跑 live smoke 后，已拿到 Slice 6 的真实 backend-backed runtime 证据。

## Changed files
- `30-build/package.json`
- `30-build/package-lock.json`
- `30-build/.gitignore`
- `30-build/apps/backend/prisma/schema.prisma`
- `30-build/apps/backend/prisma/migrations/20260326080000_slice6_reminder_device_tokens/migration.sql`
- `30-build/apps/backend/src/auth/auth.controller.ts`
- `30-build/apps/backend/src/auth/auth.service.ts`
- `30-build/apps/backend/src/auth/dto/verify-reminder-device-code.dto.ts`
- `30-build/apps/backend/src/realtime/realtime.service.ts`
- `30-build/apps/reminder/package.json`
- `30-build/apps/reminder/tsconfig.json`
- `30-build/apps/reminder/.env.example`
- `30-build/apps/reminder/src/index.ts`
- `30-build/notes/slice-6-implementation-report.md`

## What was implemented
### Backend device-specific reminder auth
- Prisma schema 新增 `ReminderDeviceToken`，存储 `deviceName`、`tokenHash`、`lastUsedAt`、`revokedAt` 与 `userId`。
- 新增 migration `20260326080000_slice6_reminder_device_tokens`，为 reminder device token 建表与索引。
- `AuthService` 抽出验证码消费逻辑，保留浏览器 `verify-code` 不变，同时新增 `verifyReminderDeviceCode(email, code, deviceName)`。
- 新增 `POST /api/auth/reminder/verify-code`：
  - 复用现有邮箱验证码登录入口
  - 为指定 `deviceName` 生成新的 raw device token
  - 同用户同设备名已有未撤销 token 会先被 revoke，再签发新的 token
  - 返回 `deviceToken`、`deviceTokenId`、`deviceName` 和当前用户信息

### Realtime support for reminder process
- `RealtimeService` 保留现有浏览器 JWT `token` 认证路径，避免破坏 Slice 5。
- 同时新增 reminder 专用 `deviceToken` query 参数认证：
  - 通过 SHA-256 hash 查 `ReminderDeviceToken`
  - 要求 token 未 revoke
  - 连接成功后更新 `lastUsedAt`
- reminder 连接与浏览器连接统一进入既有 fanout 路径，仍按当前 group 成员身份过滤 `message.created` 投递。

### Standalone reminder runtime
- 新增独立 workspace `apps/reminder`，作为最小常驻 reminder 进程。
- 提供三个 CLI 模式：
  - `request-code`：请求邮箱验证码
  - `login`：调用 `/auth/reminder/verify-code` 完成 reminder 独立登录并把 session 写到本地
  - `run`：读取本地 session，建立认证 WebSocket 连接并保持重连循环
- 本地 session 默认写入 `apps/reminder/.local/session.json`，通过 `.gitignore` 排除。
- reminder runtime 当前仅记录结构化日志：
  - `login_success`
  - `ws_connect`
  - `ws_reconnect`
  - `ws_disconnect`
  - `event_received`
- 明确没有实现：
  - 提醒强度路由
  - 系统通知
  - 点击打开浏览器
  - fallback pull / cursor / 去重

## Acceptance coverage
- `提醒进程启动并成功连接` — COVERED
  - 已通过 live smoke 实测：`smoke:reminder-runtime` 成功完成 reminder 独立登录、device token 签发与 `ws_connect`
- `提醒进程可独立于浏览器登录` — COVERED
  - reminder 使用独立 endpoint `/api/auth/reminder/verify-code`
  - 已通过 live smoke 实测：后端签发 device-specific token，不依赖浏览器 session / refresh token
- `强制断开后，重连尝试自动发生` — COVERED BY IMPLEMENTATION
  - `apps/reminder` 在连接关闭时会自动退避重连（1s 起步，最大 5s）
  - 本轮 live smoke 重点确认了 live connect；forced disconnect/reconnect 仍主要由实现路径与 smoke harness 逻辑背书，建议 review 继续核对

## Validation
### Static validation
- `npm install --package-lock-only --ignore-scripts` — PASS
- `npm run prisma:generate --workspace @minimal-im-reminder/backend` — PASS
- `npm run typecheck` — PASS
- `npm run build` — PASS

### CLI/runtime-surface validation
- `node 30-build/apps/reminder/dist/index.js` — PASS
  - 输出 reminder CLI usage，确认独立 runtime build 产物可执行

### Live smoke validation
- Backend runtime:
  - 在 `PORT=3001` 下实际启动 backend，并使用 `http://localhost:3001/api` 作为 smoke 目标
- Web realtime smoke:
  - `npm run smoke:web-realtime -- --api-base-url http://localhost:3001/api --timeout-ms 15000` — PASS
  - 验证通过：双用户登录、建群、邀请、第一条消息投递、断开重连、重连后第二条消息继续收到 `message.created`
- Reminder runtime smoke:
  - 首次失败原因：数据库尚未应用 Slice 6 migration，缺少 `ReminderDeviceToken` 表（Prisma `P2021`）
  - 修复：`set -a && source apps/backend/.env && set +a && npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma` — PASS
  - 修复后重跑：
    - `npm run smoke:reminder-runtime -- --api-base-url http://localhost:3001/api --email alice@example.com --device-name local-smoke --timeout-ms 15000` — PASS
  - 验证通过：reminder 独立登录、device token 签发、authenticated websocket handshake（`[REMINDER] ws_connect`）

## Open issues
- Slice 6 范围内刻意不实现系统通知和打开浏览器动作，避免越界进入 Slice 7。
- 当前 reminder runtime 只消费 realtime event 并记录日志，不做用户可见提醒，这是本次有意的 scope control。
- 本轮已拿到 live connect 证据，但 reminder forced disconnect/reconnect 尚未像 web realtime 那样单独产出一条独立成功记录；review 可继续核对其实现路径与 harness 覆盖度。

## Recommended next step
- Hand off to: `review`
- 建议独立 review 重点检查：
  1. `POST /api/auth/reminder/verify-code` 是否确实签发 device-specific token，而不是复用浏览器 session
  2. `/realtime` 是否同时支持浏览器 JWT 和 reminder device token，且不破坏现有 Slice 5 路径
  3. `apps/reminder` 是否只实现最小 runtime/login/reconnect，而未提前引入 Slice 7/8 逻辑
  4. 本轮 live smoke 证据是否足以放行 Slice 6，以及 reminder reconnect 证据是否还需补强

## Self-review
- Result: PASS
- Checked against:
  - `10-spec/01-spec.md` 中 3.1 / 4.5 / 4.6 / 6.1 / 8.2 / 9.2
  - `10-spec/02-task-contract.md` 中 Slice 6 scope / non-goals / acceptance
  - `10-spec/04-implementation-notes.md` 中 3.1 reminder token 模型与 6 日志规范的最小子集
- Problems found:
  - 初版 reminder runtime 曾残留一个无效的重连状态变量，导致 TypeScript 检查失败。
  - CommonJS build 下不能使用 `import.meta.url` 计算默认 state path。
- Fixes applied:
  - 移除无效重连变量赋值，改为直接重新发起连接。
  - 将默认 state path 改为基于 `__dirname` 解析，匹配当前 build 输出。
- Remaining risks:
  - 本轮已补到 fresh live smoke，但 reminder reconnect 仍未像 web realtime 那样独立演示 forced disconnect 后的成功恢复记录。
  - 当前 device token 只实现签发和 WS 使用，没有做 revoke 管理界面或设备列表，这符合 Slice 6 最小范围。
  - 当前 reminder runtime 的“后台常驻”形态是长运行 CLI 进程，不含系统服务安装/守护进程封装；这仍符合本 slice 的最小运行时目标。
