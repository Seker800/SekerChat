# Docs

这里保留当前 IM 主链仍然有效的工程说明。

如果你是在找当前环境与部署真相，优先看：

1. [Environment Model](./environment-model.md)
2. [Local Dev Runbook](./local-dev-runbook.md)
3. [Synology Deployment](./synology-deployment.md)

## Available docs

- [Environment Model](./environment-model.md)
- [API Capabilities Guide](./api-capabilities-guide.md)
- [Bot User Boundary](./bot-user-boundary.md)
- [Commit 规范](./Commit规范.md)
- [Dependency Risk Register](./dependency-risk-register.md)
- [v0.8.6 版本说明](./version-notes-v0.8.6.md)
- [v0.8.0 版本说明](./version-notes-v0.8.0.md)
- [v0.7.0 版本说明](./version-notes-v0.7.0.md)
- [Local Dev Runbook](./local-dev-runbook.md)
- [Open-source Release Runbook](./open-source-release.md)
- [Synology Deployment](./synology-deployment.md)
- [Workspace Sidebar Notes](./workspace-sidebar-agent-notes.md)
- [Windows Desktop Pet](./desktop-pet.md)

# Core Auto-Runner

这个项目本地 runner 只做一件事：消费当前 slice 的 implementation / review artifact，并把状态推进到下一步。

它不会修改历史归档内容，只消费当前 slice 的实现和 review 产物。

## Core behavior

- 同一个 implementation report 不会被消费两次
- 同一个 review report 不会被消费两次
- 同一个 pending review dispatch 也不会被重复 surface
- `valid_handoff` / `env_blocked_handoff` 会把当前 slice 推到 `in_review`
- review `PASS` 会自动把 `current_slice` 前进到下一个 slice
- 如果当前 contract 已无下一个 slice，review `PASS` 会把当前 slice 标成 `done`
- runner 对 outer trigger 只输出一个 decisive signal：
  - `DISPATCH_REVIEW_NOW`
  - `NO_REPLY`

## Single state file

`Old/50-handoff/auto-slice-runner-state.json` 是旧 runner 的单一消费状态文件。

它记录：

- 当前 slice / phase
- 最近一次状态迁移动作
- 已消费过的 implementation / review artifact hash
- 当前 pending action
- 当前 pending review dispatch（按 implementation hash 防重）

这批 runner / review 文档主要描述旧工作流留下的实现和证据：

- `APP/notes/`
- `40-review/reports/`
- `Old/50-handoff/`
- `Old/10-spec/`

## Trigger output

`Old/50-handoff/auto-slice-trigger.json` 是给旧 outer trigger 直接读取的最小输出。

只有两个 `action`：

- `DISPATCH_REVIEW_NOW`
- `NO_REPLY`

当 `action` 是 `DISPATCH_REVIEW_NOW` 时，文件里会附带可直接消费的 `reviewDispatch` payload。
同一 implementation hash 的 dispatch 被 state 标记后，后续 runner 再跑也只会返回 `NO_REPLY`，直到出现新的 implementation report 或新的 review report。

## Commands

在 `APP/` 下常用命令：

```bash
npm run auto-slice:inspect
npm run auto-slice:run
npm run auto-slice:signal
```

需要只看将要发生什么但不写盘时：

```bash
npm run auto-slice:dry-run
```

## Output

### Signal

- `npm run auto-slice:signal` 只会输出：
  - `DISPATCH_REVIEW_NOW`
  - `NO_REPLY`
- `run --format text` 也是同样语义

### JSON

JSON 输出里最重要的字段：

- `action`
- `before`
- `after`
- `signal`
- `pendingAction`
- `trigger`

## Typical flow

1. coding 写出 `APP/notes/slice-N-implementation-report.md`
2. `npm run auto-slice:run`
3. runner 把状态推进到 `in_review`，并且只在第一次输出 `DISPATCH_REVIEW_NOW`
4. outer trigger 直接读取 `Old/50-handoff/auto-slice-trigger.json` 并派发 review
5. 后续再次跑 runner，如果还是同一 implementation hash，则只返回 `NO_REPLY`
6. reviewer 写出 `40-review/reports/...slice-N-review-report.md`
7. 再跑一次 `npm run auto-slice:run`
8. runner 消费 review verdict，并自动推进到 rework 或下一个 `current_slice`

## Cron guidance

cron job 不应该自己推断“现在是不是该发 review 消息”。

推荐做法：

1. 运行 `npm run auto-slice:signal`
2. 如果 stdout 是 `DISPATCH_REVIEW_NOW`，直接读取 `Old/50-handoff/auto-slice-trigger.json`
3. 用其中的 `reviewDispatch` 做一次 review 派发
4. 如果 stdout 是 `NO_REPLY`，就什么都不要发
