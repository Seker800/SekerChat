# CODING REPORT

## Task
- Target slice: `Slice 7 — 提醒投递`
- Goal: 在现有 Slice 6 reminder runtime 上，只实现两级提醒投递闭环：普通消息轻量声音，提及/回复当前用户时强声音 + 系统通知；会话 URL 嵌入提醒动作；前端支持稳定群组 URL；不提前做 Slice 8 fallback pull/dedupe 或更广泛偏好矩阵。

## Status
- IMPLEMENTED
- Current session note: 代码实现与静态验证已完成；后续已在本机补上 Slice 7 migration、切换到最新 backend（`http://localhost:3001/api`）并完成 fresh live smoke，拿到 reminder delivery 的真实 backend-backed 证据。

## Changed files
- `30-build/package.json`
- `30-build/apps/backend/prisma/schema.prisma`
- `30-build/apps/backend/prisma/migrations/20260326093000_slice7_message_mentions_reply/migration.sql`
- `30-build/apps/backend/src/messages/dto/create-message.dto.ts`
- `30-build/apps/backend/src/messages/messages.service.ts`
- `30-build/apps/frontend/src/App.vue`
- `30-build/apps/frontend/src/components/GroupsWorkspace.vue`
- `30-build/apps/frontend/src/lib/api.ts`
- `30-build/apps/frontend/src/styles.css`
- `30-build/apps/reminder/.env.example`
- `30-build/apps/reminder/src/index.ts`
- `30-build/scripts/smoke-reminder-delivery.mjs`
- `30-build/notes/slice-7-implementation-report.md`

## What was implemented
### Backend message metadata for reminder intensity routing
- `Message` schema 新增：
  - `mentionedUserIds: String[]`
  - `replyToMessageId`
  - self-relation `replyToMessage` / `replies`
- 新增 migration `20260326093000_slice7_message_mentions_reply`，为 reply/mention metadata 建列、索引与 FK。
- `CreateMessageDto` 新增可选 `replyToMessageId`。
- `MessagesService.createMessage()` 现在会：
  - 校验 `replyToMessageId` 必须属于同一 group
  - 从文本内容自动解析 mention token
  - 将 mention 用户 ID 列表写入消息
  - 在 list/create/realtime payload 中序列化 `mentionedUserIds` 与 `replyTo`
- mention 解析规则保持最小可用：
  - 支持 `@email`
  - 支持 `@localpart`
  - 支持无空格 display-name token

### Frontend stable conversation URL + minimal reply/mention surface
- 浏览器工作区改为感知 `/groups/:groupId` 路径：
  - 初始加载可从 URL 选中 group
  - 选择群组时会同步 `history.pushState`
  - 刷新 / 直接打开 `/groups/:groupId` 时能恢复到对应群组
- 消息发送新增最小 reply surface：
  - 每条消息增加 `Reply`
  - composer 显示当前 reply target，可清除
  - 发送 text / attachment 时都会带上 `replyToMessageId`
- 前端 API 类型扩展 `mentionedUserIds` 与 `replyTo`，与 backend/realtime payload 对齐。
- UI 文案明确引导使用 `@email` / `@localpart` mention，以便 reminder 强度路由可被手动验证。

### Reminder runtime delivery behavior
- reminder runtime 现在会对 `message.created` 做最小投递判定：
  - 自己发的消息直接跳过
  - 普通消息 → Level 1 → 轻量声音
  - `mentionedUserIds` 命中当前用户或 `replyTo.senderId === currentUser.id` → Level 2
- 新增会话 URL 生成：
  - 默认从 `apiBaseUrl` 推导 origin
  - 支持 `REMINDER_WEB_BASE_URL` 显式覆盖
  - URL 形式为 `/groups/:groupId`
- 新增 delivery trace / diagnostics：
  - `sound_played`
  - `sound_skipped`
  - `notify_shown`
  - `notify_skipped`
  - `browser_open`
  - `REMINDER_TRACE_PATH` 可输出 JSONL trace，供 focused smoke 校验
- 新增 `REMINDER_DISABLE_SIDE_EFFECTS=1` 与 `REMINDER_AUTO_OPEN_LEVEL2=1`，仅用于 focused validation，不改变默认 runtime 行为。

### Notification/sound transport behavior
- macOS:
  - 声音：使用 `afplay` 播放系统声音文件，Level 1/2 使用不同声音候选
  - 通知：
    - 若存在 `terminal-notifier`，使用它投递通知，并附带 `-open <conversationUrl>` 与 `-timeout 3`
    - 若不存在 `terminal-notifier`，回退到 `osascript display notification`
- 这保证了：
  - 有声音强度分级
  - 有系统通知 best-effort
  - 会话 URL 始终被生成并进入 reminder delivery path
- 这也带来当前平台上的明确限制：
  - 本机未安装 `terminal-notifier`
  - 因此当前 macOS fallback 只能用 `osascript`
  - `osascript display notification` 不能程序化绑定点击打开 URL
  - `osascript display notification` 也不能强制 2-3 秒自动消失，实际由系统通知样式（banner/alert）决定
- 结论：
  - 代码已支持“若通知 transport 能力足够，则使用带 open-action 的通知”
  - 在当前本机能力下，Level 2 仍有强声音 + 系统通知，但“点击通知打开 URL / 强制 2-3 秒自动消失”只能作为 `terminal-notifier` 可用时的强保证；否则为 documented best-effort fallback

## Acceptance coverage
- `收到普通消息触发轻量声音` — COVERED BY IMPLEMENTATION
  - reminder runtime 已实现 Level 1 路由与轻量声音 transport
- `收到提及或回复当前用户的消息触发强声音 + 弹窗通知` — COVERED BY IMPLEMENTATION
  - backend 已向 reminder payload 提供 `mentionedUserIds` / `replyTo`
  - reminder runtime 已实现 Level 2 检测、强声音与系统通知路径
- `弹窗通知 2-3 秒后自动消失` — PARTIALLY COVERED / PLATFORM-DEPENDENT
  - `terminal-notifier` transport 下按 3 秒参数执行
  - 当前本机 macOS fallback (`osascript`) 无法强制控制该行为，已明确记录 tradeoff
- `点击通知打开正确的群组会话页面` — PARTIALLY COVERED / PLATFORM-DEPENDENT
  - 若 `terminal-notifier` 可用，则通知动作携带正确会话 URL
  - 当前本机 `osascript` fallback 无法绑定点击事件；focused smoke 改以 trace 验证 URL 生成和 open target 正确
- `即使浏览器已打开，提醒仍然工作` — COVERED BY ARCHITECTURE
  - reminder 仍是独立进程、独立 auth、独立 websocket 消费路径；Slice 7 未引入任何“浏览器已开则抑制提醒”的逻辑

## Validation
### Static validation
- `npm run prisma:generate --workspace @minimal-im-reminder/backend` — PASS
- `npm run typecheck` — PASS
- `npm run build` — PASS

### CLI/runtime surface
- `node 30-build/apps/reminder/dist/index.js` — PASS
  - reminder CLI usage 正常输出

### Live / smoke validation
- `set -a && source apps/backend/.env && set +a && npx prisma migrate deploy --schema apps/backend/prisma/schema.prisma` — PASS
  - 已补上 Slice 7 migration：`20260326093000_slice7_message_mentions_reply`
- backend runtime：
  - 清理旧 backend 后，以最新 Slice 7 代码在 `PORT=3001` 启动 backend，并使用 `http://localhost:3001/api` 作为 smoke 目标
- `npm run smoke:reminder-runtime -- --api-base-url http://localhost:3001/api --email alice@example.com --device-name slice7-runtime --timeout-ms 15000` — PASS
  - 证明 reminder 独立登录、device token 签发与 websocket connect 在最新 Slice 7 backend 上仍正常
- `REMINDER_DISABLE_SIDE_EFFECTS=1 npm run smoke:reminder-delivery -- --api-base-url http://localhost:3001/api --timeout-ms 20000` — PASS
  - 验证结果：
    - `soundsLevel1: 1`
    - `soundsLevel2: 2`
    - `notifications: 2`
    - `opens: 2`
    - `expectedUrl: http://localhost:3001/groups/<groupId>`
  - 说明：普通消息 / mention / reply 三种路径均触发了预期强度路由，且会话 URL 生成与 open target 正确
- `npm run smoke:web-realtime -- --api-base-url http://localhost:3001/api --timeout-ms 15000` — PASS
  - 作为 Slice 5 非回归检查，确认 Slice 7 改动未破坏浏览器 realtime 路径

## Open issues
- 当前本机没有 `terminal-notifier`，因此 macOS 真正的系统通知 transport 仍只能走 `osascript` fallback：
  - 无法强制 2-3 秒自动消失
  - 无法把真实“点击通知”动作可靠映射到 `open <conversationUrl>`
- 本轮 live smoke 通过 `REMINDER_DISABLE_SIDE_EFFECTS=1` + trace/open 计数验证了 URL 生成、强度路由与 open target，但没有把真实系统通知点击行为作为 fresh live 证据锁死。
- 本轮刻意没有引入：
  - Slice 8 fallback pull
  - websocket/pull 去重
  - 通知偏好矩阵
  - DND / mute / per-group preference

## Recommended next step
- Hand off to: `review`
- review 建议重点检查：
  1. backend mention/reply metadata 是否只做 Slice 7 所需最小实现，没有提前扩展到复杂消息引用系统
  2. frontend `/groups/:groupId` path 行为是否足以支撑 reminder open target
  3. reminder runtime 是否对 own message 正确跳过，并将 Level 1 / Level 2 路由绑定到 `mentionedUserIds` / `replyTo.senderId`
  4. `terminal-notifier` / `osascript` 双路径与当前 macOS tradeoff 说明是否准确
  5. 本轮 fresh live smoke（runtime + delivery + web non-regression）是否足以支持 Slice 7 放行

## Self-review
- Result: PASS WITH ENV-BLOCKED LIVE VALIDATION
- Checked against:
  - `10-spec/01-spec.md` 中 3.1 / 4.3 / 4.4 / 6.1 / 9.2
  - `10-spec/02-task-contract.md` 中 Slice 7 scope / non-goals / acceptance
  - `10-spec/04-implementation-notes.md` 中 2.1 / 2.3 / 3.2 / 3.3 / 6
- Problems found:
  - 变更 Prisma schema 后，初次 typecheck 因 client 未 regenerate 而失败
  - 前端 `popstate` 清理初版用了临时匿名函数，无法正确 remove listener
  - 当前机器缺少 `terminal-notifier`，无法在 macOS 上硬保证通知点击动作与超时
- Fixes applied:
  - 补跑 `prisma generate`
  - 将 `popstate` 监听器改为稳定函数引用
  - 在 reminder runtime 中实现 `terminal-notifier` 优先、`osascript` fallback，并把平台限制写入日志与报告
- Remaining risks:
  - 当前 fresh live smoke 已补齐，但真实系统通知点击行为与 2-3 秒自动消失在本机 `osascript` fallback 下仍缺强保证；若要把这两点作为平台级强契约，需要安装 `terminal-notifier` 或改用更强的原生桥接
  - mention 解析仍是最小 token 规则，不是完整富文本 mention 系统；这符合 Slice 7 范围
  - 当前验证侧重功能闭环与 URL/open target；尚未引入更复杂的通知偏好或 DND 场景
