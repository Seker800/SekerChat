# CODING REPORT

## Task
- Goal: 为 `minimal-im-reminder` 增加本地 smoke harness，优先复用现有真实 auth / group / message / realtime / reminder runtime 路径，不新增暴露式测试 backdoor endpoint。
- Requested priorities:
  - `web realtime smoke`：请求验证码、登录两个用户、建群、邀请、连接 WebSocket、发送消息、验证 `message.created` 投递与重连后继续收消息。
  - `reminder runtime smoke / helper`：验证 reminder 独立登录、device token、认证 WebSocket 连接，范围保持最小。

## Status
- IMPLEMENTED
- Current session note: 本次交付已完成脚本与 package 入口，并通过 `typecheck` / `build`；由于当前本机没有可用后端运行时，本 session 只能验证脚本语法、help 输出与“环境缺失时快速失败”，未执行 live backend-backed smoke。

## Changed files
- `30-build/package.json`
- `30-build/scripts/smoke-web-realtime.mjs`
- `30-build/scripts/smoke-reminder-runtime.mjs`
- `30-build/notes/smoke-harness-implementation-report.md`

## What was implemented
### Web realtime smoke
- 新增 `30-build/scripts/smoke-web-realtime.mjs`。
- 仅使用现有真实 API / realtime 路径：
  - `POST /api/auth/request-code`
  - `POST /api/auth/verify-code`
  - `POST /api/groups`
  - `POST /api/groups/:groupId/members`
  - `POST /api/groups/:groupId/messages`
  - `GET /api/groups/:groupId`
  - `/realtime?token=...`
- 覆盖的 smoke 流程：
  - alice、bob 分别请求验证码并登录
  - alice 建群并邀请 bob
  - alice、bob 建立认证 WebSocket
  - alice 发送第一条 text message，验证 bob 收到匹配的 `message.created`
  - bob 主动断开并重新连接
  - alice 发送第二条 text message，验证 bob 重连后的连接继续收到 `message.created`
- 脚本内置超时控制与明确报错，不满足前置条件时直接退出，不等待挂死。

### Reminder runtime smoke
- 新增 `30-build/scripts/smoke-reminder-runtime.mjs`。
- 该脚本优先复用已有 `apps/reminder/dist/index.js` CLI，而不是重写提醒器逻辑。
- 覆盖的最小 reminder 路径：
  - 通过 `request-code` 请求验证码
  - 通过 `login` 调用现有 `/api/auth/reminder/verify-code`，生成 device token 并写入临时 state
  - 通过 `run` 启动 reminder runtime，等待现有 `[REMINDER] ws_connect` 日志，证明 device token 的 realtime 握手成功
  - 成功后发送 `SIGINT` 收口并删除临时 state 文件
- 如果 reminder build 产物不存在，脚本会明确提示先执行：
  - `npm run build --workspace @minimal-im-reminder/reminder`

### Package entry points
- 在根 `30-build/package.json` 新增：
  - `npm run smoke:web-realtime`
  - `npm run smoke:reminder-runtime`

## Exact prerequisites
- `smoke:web-realtime`
  - 后端已启动，且 `--api-base-url` 可达，默认 `http://localhost:3000/api`
  - 后端 `EMAIL_WHITELIST` 包含两位 smoke 用户，默认 `alice@example.com` 与 `bob@example.com`
  - 运行环境为本仓库当前 Node 版本（脚本要求全局 `fetch` 与 `WebSocket`）
- `smoke:reminder-runtime`
  - 后端已启动，且 `--api-base-url` 可达，默认 `http://localhost:3000/api`
  - `EMAIL_WHITELIST` 包含 reminder smoke 用户，默认 `alice@example.com`
  - 已先构建 reminder：
    - `npm run build --workspace @minimal-im-reminder/reminder`

## Validation
### Static / package validation
- `node --check 30-build/scripts/smoke-web-realtime.mjs` — PASS
- `node --check 30-build/scripts/smoke-reminder-runtime.mjs` — PASS
- `npm run smoke:web-realtime -- --help` — PASS
- `npm run smoke:reminder-runtime -- --help` — PASS
- `npm run typecheck` — PASS
- `npm run build` — PASS

### Clear-failure-path validation
- `npm run smoke:web-realtime -- --timeout-ms 1500` — PASS AS EXPECTED FAILURE
  - 当前环境无可达 backend，脚本在短超时内明确失败：
    - `SMOKE FAILED: fetch failed`
  - 同时输出前置条件提示，没有挂死。
- `npm run smoke:reminder-runtime -- --timeout-ms 1500` — PASS AS EXPECTED FAILURE
  - 当前环境无可达 backend，reminder CLI 很快返回：
    - `[REMINDER] fatal {"error":"fetch failed"}`
  - 外层 harness 同样在短超时内明确失败，没有挂死。

### Runtime validation status
- 本 session 未执行 live backend-backed smoke。
- 原因：
  - 当前工作区没有正在运行的 backend 可供本地脚本接入；
  - 按任务要求，本次实现不新增任何测试 backdoor endpoint，只能等待真实 backend 环境存在时再跑 live smoke。

## Usage
- Web realtime smoke:
  - `npm run smoke:web-realtime -- --api-base-url http://localhost:3000/api`
- Reminder runtime smoke:
  - `npm run smoke:reminder-runtime -- --api-base-url http://localhost:3000/api --email alice@example.com --device-name local-smoke`

## Scope control
- 未新增任何 broad dev/test backdoor HTTP endpoint。
- 未修改现有 backend auth / realtime contract。
- reminder smoke 只验证最小 login / device-token / WS connect，不提前实现 Slice 7/8 的通知、fallback pull、去重或浏览器打开动作。

## Recommended next step
- 在有真实本地 backend + DB 的环境中运行：
  - `npm run smoke:web-realtime -- --api-base-url <live-local-api>`
  - `npm run smoke:reminder-runtime -- --api-base-url <live-local-api> --email <whitelisted-email>`
- 若需要更强证据，可在下一轮把 smoke 成功输出追加到 handoff / review 材料，但不需要再扩测试 endpoint。

## Self-review
- Result: PASS
- Checked against:
  - `10-spec/01-spec.md` 中 3.1 / 4.5 / 4.6 / 6.1 / 9.1 / 9.2
  - `10-spec/02-task-contract.md` 中 Slice 5 / Slice 6 的 scope、non-goals、acceptance
  - `30-build/notes/slice-5-implementation-report.md`
  - `30-build/notes/slice-6-implementation-report.md`
- Problems found:
  - 初版 `web` smoke 漏了鉴权 POST helper，导致建群 / 发消息路径无法真正复用受保护 API。
  - 初版 `reminder` smoke 使用了对运行时支持不够稳妥的 `import.meta.dirname`。
- Fixes applied:
  - 为 `web` smoke 补齐带 Bearer token 的 POST helper，并统一用于 create-group / invite / create-message。
  - 将 `reminder` smoke 的路径解析改为 `fileURLToPath(import.meta.url)` + `dirname(...)`。
- Remaining risks:
  - 当前还没有 live backend-backed 成功运行证据；本轮只能证明 harness 已实现、可构建、可帮助定位前置条件缺失。
  - `smoke-reminder-runtime` 依赖 reminder dist 已存在；虽然脚本会明确报错，但首次使用仍需先 build。
