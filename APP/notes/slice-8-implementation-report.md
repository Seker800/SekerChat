# CODING REPORT

## Task
- Target slice: `Slice 8 — Fallback Pull 和去重`
- Goal: 只实现 cursor / seq 驱动的 fallback pull endpoint、reminder 侧在 websocket 不健康或重连后的 fallback pull、websocket/pull 去重、以及本地 cursor 持久化与恢复；不提前进入 Slice 9 hardening、偏好系统或更广泛运行时治理。

## Status
- IMPLEMENTED
- Current session note: 代码实现、schema/client 更新、workspace typecheck 与 build 已完成；fresh backend-backed smoke 本轮未能跑通，因为当前 session 内 `curl http://localhost:3000/3001` 不可达，且 `prisma migrate deploy` 对 `localhost:5432` 返回 `P1001`。

## Changed files
- `30-build/package.json`
- `30-build/apps/backend/prisma/schema.prisma`
- `30-build/apps/backend/prisma/migrations/20260326113000_slice8_message_event_sequence/migration.sql`
- `30-build/apps/backend/src/app.module.ts`
- `30-build/apps/backend/src/messages/messages.module.ts`
- `30-build/apps/backend/src/messages/messages.service.ts`
- `30-build/apps/backend/src/realtime/realtime.controller.ts`
- `30-build/apps/backend/src/realtime/realtime.module.ts`
- `30-build/apps/backend/src/realtime/realtime.service.ts`
- `30-build/apps/backend/src/realtime/realtime.types.ts`
- `30-build/apps/frontend/src/lib/api.ts`
- `30-build/apps/reminder/src/index.ts`
- `30-build/scripts/smoke-reminder-fallback.mjs`
- `30-build/notes/slice-8-implementation-report.md`

## What was implemented
### Backend cursor timeline and fallback pull endpoint
- `Message` schema 新增 `eventSequence: BigInt @unique @default(autoincrement())`，把现有 `message.created` 时间线提升为单调递增 cursor 源，而不在 Slice 8 额外引入独立 events 表。
- 新增 migration `20260326113000_slice8_message_event_sequence`：
  - 建 `Message_eventSequence_seq`
  - 为历史消息补齐 `eventSequence`
  - 建唯一索引与 `(groupId, eventSequence)` 索引
- realtime event contract 现在统一携带 `eventId`（stringified bigint），使 websocket 与 pull 结果在 reminder 侧可以走同一处理路径。
- 新增 `GET /api/realtime/events`：
  - 通过 `x-reminder-device-token` 做 reminder device token 认证
  - 接受 `cursor` / `limit`
  - 仅返回当前用户仍有 membership 的群组中，`eventSequence > cursor` 的 `message.created` 事件
  - 按 `eventSequence ASC` 返回，并带 `nextCursor`

### Reminder fallback pull, dedupe, and local cursor recovery
- reminder session state 文件新增：
  - `lastEventId`
  - `cursorUpdatedAt`
- reminder runtime 现在会：
  - 从本地 state 文件恢复 cursor
  - websocket 收到事件后推进 cursor 并持久化
  - websocket 断开期间按固定 interval 执行 fallback pull
  - 在启动后存在持久化 cursor 时执行一次 startup recovery pull
  - 在 websocket reconnect 后执行一次 post-reconnect pull
- websocket 与 pull 统一走 `handleIncomingEvent(...)`，并用两层抑制避免重复提醒：
  - `eventId <= lastEventId` 的 cursor 抑制
  - 最近消息 key（`groupId:messageId`）的有界内存集合抑制
- duplicate skip 会记录 `notify_skipped { reason: "duplicate" }`，pull 会记录 `fallback_pull { cursor, returnedCount, nextCursor, trigger }`

### Focused validation harness for Slice 8 behavior
- 新增 `smoke:reminder-fallback` 脚本与 `30-build/scripts/smoke-reminder-fallback.mjs`
- 该 harness 设计用于验证：
  - websocket 在线时先收到一条消息并把 cursor 写入 state 文件
  - reminder 停止期间产生遗漏消息
  - reminder 重启后通过 fallback pull 把遗漏消息补回来
  - state 文件 cursor 在恢复后继续前进
  - offline 期间那条消息只被补投递一次
- 本轮因为本地 API / DB 访问不可用，脚本未能取得 fresh runtime 结果，但 harness 已完成并可在环境恢复后直接运行

## Acceptance coverage
- `WebSocket 临时中断后，提醒进程可使用 cursor 通过 pull 捕获遗漏事件` — COVERED BY IMPLEMENTATION
  - backend 提供基于 `eventSequence` 的增量 pull endpoint
  - reminder runtime 支持 startup recovery / post-reconnect / ws-unhealthy pull
- `正常重连条件下同一事件不会重复通知用户` — COVERED BY IMPLEMENTATION
  - shared event handling + cursor gate + bounded recent-message dedupe
- `cursor 在提醒进程重启后正确恢复` — COVERED BY IMPLEMENTATION
  - reminder state 文件持久化 `lastEventId`
  - runtime 启动会恢复 cursor 并据此做 catch-up pull

## Validation
### Static validation
- `npm run prisma:generate --workspace @minimal-im-reminder/backend` — PASS
- `npm run typecheck` — PASS
- `npm run build` — PASS

### Environment-blocked runtime validation
- `set -a && source apps/backend/.env && set +a && npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma` — FAILED
  - `P1001: Can't reach database server at localhost:5432`
- `curl http://localhost:3001/api` — FAILED
- `curl http://localhost:3000/api` — FAILED
- `npm run smoke:reminder-fallback -- --api-base-url http://localhost:3001/api ...` — NOT RUN
  - 未运行原因：当前 session 内 API 不可达，先验条件不成立

## Open issues
- 当前实现把 cursor timeline 锁定在 `Message.eventSequence`，因此 Slice 8 的 fallback pull 只覆盖当前已存在的 `message.created` 事件，不试图提前为未来 `group.updated` / `conversation.updated` 建更泛化事件仓储。这是刻意的 scope control，不是遗漏。
- fresh runtime smoke 仍需在“API 可访问 + PostgreSQL 可访问”的环境里补跑，特别是 `smoke:reminder-fallback`。

## Recommended next step
- Hand off to: `review`
- review 建议重点检查：
  1. `eventSequence` 直接挂在 `Message` 上是否保持了 Slice 8 最小实现，而没有提前引入独立 event store
  2. `GET /api/realtime/events` 的 membership gate、cursor 语义、device-token auth 是否正确
  3. reminder runtime 的 `startup_recovery` / `post_reconnect` / `ws_unhealthy` pull 触发条件是否符合 contract
  4. duplicate suppression 是否真的统一覆盖 websocket 与 pull 两条路径
  5. 当前 runtime validation 缺口是否仅由环境不可达造成，而不是实现本身缺证据

## Self-review
- Result: PASS WITH ENV-BLOCKED LIVE VALIDATION
- Checked against:
  - `10-spec/01-spec.md` 中 3.1 / 4.3 / 6.1 / 9.2 / 9.3
  - `10-spec/02-task-contract.md` 中 Slice 8 scope / non-goals / acceptance
  - `10-spec/04-implementation-notes.md` 中 1.1 / 1.2 / 2.4 / 5 / 6
- Problems found:
  - backend `typecheck` 初次失败不是实现错误，而是旧的 `apps/backend/dist/tsconfig.tsbuildinfo` 增量缓存仍引用旧 Prisma type surface
  - 本地 runtime validation 阶段，CLI 无法在当前 session 内到达 `localhost:3000/3001` API，`prisma migrate deploy` 也无法到达 `localhost:5432`
- Fixes applied:
  - 重新生成 Prisma client
  - 清掉 backend 旧的增量 build cache 后重跑 workspace `typecheck`
  - 把 runtime validation 明确标记为 env-blocked，而不是假装 smoke 已完成
- Remaining risks:
  - `smoke:reminder-fallback` 尚未在真实 backend 上跑过，所以 Slice 8 的 live proof 仍待环境恢复后补齐
  - 目前 cursor timeline 仅覆盖 `message.created`，如果后续需要把其他事件类型纳入 reminder/fallback，需要在未来 slice 明确扩展 contract，而不是在本轮继续隐式扩张
