# APP 开发规则

补充项目根 `AGENTS.md`，无冲突的追加规则。

## 环境模型硬规则

SekerChat 是“同一套程序，两套运行环境”：

- 生产环境整套在群晖：`frontend + backend + postgres + minio`
- 开发环境整套在本机：本机前后端 + 本机 Docker 的 Postgres/MinIO
- 两套环境长期并存，不要通过覆盖同一个 `.env` 来回切换
- 开发启动默认使用 `apps/backend/.env.development.local`
- 本机生产参考配置可保存在 `apps/backend/.env.production.reference.local`
- 这些 `.env*.local` 文件是本机私有配置，不提交 Git

开发任务禁止事项：

- 不要把 `apps/backend/.env` 在生产/开发之间反复覆盖
- 不要让本机开发后端直连群晖生产 PostgreSQL
- 不要让本机开发后端直连群晖生产 MinIO bucket
- 除非用户明确要求生产维护，不要运行任何会写入群晖生产数据库或 MinIO 的命令

开发启动固定入口：

```bash
cd APP
npm run dev:backend
npm run dev:frontend
```

`npm run dev:backend` 会通过 `scripts/run-backend-dev.sh` 自动加载 `apps/backend/.env.development.local`。

## 写完代码后确保 IM 处于启动状态

**先检查再启动。** 直接跑 `npm run dev:backend` 会创建重复进程，这是已知问题。

正确流程：

1. 检查后端是否在 3100 运行：`lsof -nP -iTCP:3100 -sTCP:LISTEN`
2. 检查前端是否在 5173 运行：`lsof -nP -iTCP:5173 -sTCP:LISTEN`
3. 只启动缺失的服务

```bash
# 只有端口没监听时才启动
cd APP
npm run dev:backend    # 后端 → 3100
npm run dev:frontend   # 前端 → 5173
```

如果发现多实例（如 3100 + 3002 同时监听），先清理再启动：

```bash
pkill -f "nest start"; pkill -f "apps/backend/dist"
```

详细说明见 `docs/local-dev-runbook.md`。

## 自动提交

遵循根 `AGENTS.md` 的自动提交策略：完成一个内聚里程碑后直接创建本地提交。commit message 统一遵循 `docs/Commit规范.md`，使用中文类型前缀，不添加工具或身份前缀。

## 定期 Push

每完成 2-3 个本地提交，或每 1-2 小时的实际工作时间，执行一次 `git push`。

Push 前：
- 确认当前分支不是 `main`/`master`（如在敏感分支上则跳过并说明）
- 确认最近的提交都通过了 type-check / lint

Push 后简要说明推送了哪些提交。
