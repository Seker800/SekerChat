# CODING REPORT

## Task
- Target slice: `Slice 5 — 实时事件通道`
- Goal: 在现有 auth 与 message 流程上，仅实现最小 realtime 闭环：WebSocket 服务端、认证连接、`message.created` 事件发射、浏览器端 group message 实时更新与断线重连。

## Status
- IMPLEMENTED
- Current session note: 代码实现仍已落地，但本次 session 的运行时复验被本机环境阻塞；**未在本报告中标记 slice done**，等待 main 判断是按现有证据送审，还是先恢复本机验证环境后再复验。

## Changed files
- `30-build/apps/backend/package.json`
- `30-build/package-lock.json`
- `30-build/apps/backend/src/app.module.ts`
- `30-build/apps/backend/src/main.ts`
- `30-build/apps/backend/src/messages/messages.module.ts`
- `30-build/apps/backend/src/messages/messages.service.ts`
- `30-build/apps/backend/src/realtime/realtime.module.ts`
- `30-build/apps/backend/src/realtime/realtime.service.ts`
- `30-build/apps/backend/src/realtime/realtime.types.ts`
- `30-build/apps/frontend/src/App.vue`
- `30-build/apps/frontend/src/components/GroupsWorkspace.vue`
- `30-build/apps/frontend/src/lib/api.ts`
- `30-build/notes/slice-5-implementation-report.md`

## What was implemented
### Backend realtime channel
- 新增轻量 `RealtimeModule` / `RealtimeService`，使用 `ws` 挂到 Nest HTTP server 上。
- WebSocket 路径固定为 `/realtime`。
- 连接必须携带 JWT access token（query: `token`）；服务端使用现有 `JWT_ACCESS_SECRET` 校验。
- 未认证连接会被拒绝并关闭（close code `4401`）。

### `message.created` emission
- 复用现有 `MessagesService.createMessage()` 流程；消息写库成功后立即发射 realtime 事件。
- 事件契约最小化为：
  - `type: 'message.created'`
  - `groupId`
  - `occurredAt`
  - `payload`（沿用现有消息序列化结果）
- 事件投递前按当前 `groupId` 查询成员，只向当前仍在组内的已连接用户投递。

### Browser realtime handling
- 前端新增 `createRealtimeUrl()`，从现有 `VITE_API_BASE_URL` 推导 `ws/wss` 地址。
- `GroupsWorkspace.vue` 中建立 WebSocket 连接，并维护连接状态：`connecting | connected | reconnecting | disconnected`。
- 收到 `message.created` 时：
  - 仅在当前打开 group 与事件 group 相同的情况下更新消息列表
  - 通过 message id 去重，避免发送者本地 append 与回推事件重复渲染
  - image message 继续沿用受保护内容拉取并创建 blob URL
- 断线后自动重连，采用简单退避（1s 起步，最大 5s）。

### Scope control
- 未引入 fallback pull、presence、bot event、提醒进程逻辑。
- 未扩展 event taxonomy 到 Slice 5 之外。
- 复用既有 auth 与 message serialization，没有改动消息模型。

## Acceptance coverage
- `当一个客户端发送消息时，另一个连接客户端无需手动刷新即可看到` — COVERED
  - 后端会在 `createMessage()` 后广播 `message.created`
  - 前端活跃 group 视图收到事件后立即 append/upsert
- `断开连接的客户端可重连并恢复正常操作` — COVERED
  - 前端实现自动重连
  - 运行时 smoke 证明断开后的客户端重新连接后可继续接收后续消息

## Validation
### Static validation
- `npm run typecheck` — PASS
- `npm run build` — PASS

### Runtime validation
使用独立数据库 schema `slice5_retry1` 与本地后端实例 `http://127.0.0.1:3146` / `ws://127.0.0.1:3146/realtime` 做 focused smoke：
- `npx prisma migrate deploy --schema prisma/schema.prisma`（`DATABASE_URL=...schema=slice5_retry1`）— PASS
- 未带 token 连接 `/realtime` — 连接被关闭，close code `4401` — PASS
- alice、bob 建立认证 WebSocket 连接 — PASS
- alice 发送 `hello over realtime` 后，bob 无需刷新收到 `message.created` — PASS
- bob 主动断开后重新连接 — PASS
- alice 再发送 `hello after reconnect`，bob 重连后的连接正常收到事件 — PASS

运行时结果摘要：
```json
{
  "unauthorizedClose": { "code": 4401, "reason": "Unauthorized" },
  "firstEvent": {
    "type": "message.created",
    "text": "hello over realtime"
  },
  "secondEvent": {
    "type": "message.created",
    "text": "hello after reconnect"
  },
  "pass": true
}
```

### Current-session re-validation attempt
- `npm run typecheck`（2026-03-25，本 session）— PASS
- `npm run build`（2026-03-25，本 session）— PASS
- 运行时复验尝试：
  - `DATABASE_URL='postgresql://postgres:postgres@localhost:5432/minimal_im_reminder?schema=slice5_recheck2' npx prisma migrate deploy --schema prisma/schema.prisma`
  - 结果：`Prisma P1001: Can't reach database server at localhost:5432`
  - 为补临时数据库，进一步检查本机 `docker`，结果当前沙箱无法访问用户目录下的 Docker socket
- 结论：本 session 无法在当前环境里重跑新的 DB-backed realtime smoke；上面的 runtime smoke 仍是当前仓库中最近一次成功的 Slice 5 运行时证据。

## Open issues
- 当前浏览器 realtime 只对**当前打开的 group**做即时消息列表更新；未选中的 group 只保持现状，不做未读计数或列表预览刷新。这符合 Slice 5 最小验收，但后续可在更高 slice 再补。
- 当前 reconnect 只恢复连接本身，不负责补回断线期间遗漏的历史消息；这符合本 slice 范围，遗漏补偿留给后续 fallback pull slice。
- 当前机器缺少可直接访问的 PostgreSQL 运行时；同时本 session 无法访问 docker socket，因此无法在不改环境的前提下重跑新的 DB-backed integration smoke。

## Recommended next step
- Hand off to: `review`
- 建议独立 review 重点检查：
  1. `/realtime` 是否只接受认证连接
  2. `message.created` 是否只向当前 group 成员投递
  3. 前端是否在不刷新页面的情况下更新当前 group 消息列表
  4. 浏览器断线后是否会自动重连并继续接收新消息

## Self-review
- Result: PASS
- Checked against:
  - `10-spec/01-spec.md` 中 3.1 / 4.6 / 6.1 / 9.1 / 9.2
  - `10-spec/02-task-contract.md` 中 Slice 5 scope / non-goals / acceptance
  - `10-spec/04-implementation-notes.md` 中 realtime event 契约边界
- Problems found:
  - 实现过程中发现一版遗留 realtime 代码与当前约定不一致（路径/参数名/事件结构混杂），如果直接交付会造成源码与验收脚本契约不一致。
- Fixes applied:
  - 将后端源码统一为 `/realtime` + `token` + `message.created { groupId, occurredAt, payload }`
  - 清理 `main.ts` 中重复 attach realtime server 的问题
  - 重新跑 typecheck/build/runtime smoke，确认最终源码与验证结果一致
- Remaining risks:
  - 目前没有浏览器级 e2e 自动化；本轮以 typecheck/build + focused runtime smoke + 前端代码路径检查作为证据
  - 自动重连后不补历史，仍依赖后续 Slice 8 做遗漏收敛
  - 本 session 未能重跑新的 DB-backed runtime smoke；若 main 要求“本次交付必须附带当场复验证据”，需要先恢复本机 PostgreSQL 或允许可用的容器运行时
