# APP 开发规则

通用规则见根 [AGENTS.md](../AGENTS.md)。本文件只补充 APP 目录特有的操作要求。

## 开发启动固定入口

```bash
cd APP
npm run dev:backend    # 后端 → 3100
npm run dev:frontend   # 前端 → 5173
```

`npm run dev:backend` 会通过 `scripts/run-backend-dev.sh` 自动加载 `apps/backend/.env.development.local`。

## 写完代码后确保 IM 处于启动状态

**先检查再启动。** 直接跑 `npm run dev:backend` 会创建重复进程，这是已知问题。

1. 检查后端是否在 3100 运行：`lsof -nP -iTCP:3100 -sTCP:LISTEN`
2. 检查前端是否在 5173 运行：`lsof -nP -iTCP:5173 -sTCP:LISTEN`
3. 只启动缺失的服务

如果发现多实例（如 3100 + 3002 同时监听），先清理再启动：

```bash
pkill -f "nest start"; pkill -f "apps/backend/dist"
```

详细说明见 `docs/local-dev-runbook.md`。
