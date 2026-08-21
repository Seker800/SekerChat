# 生产/本地双环境方案（Archived Idea）

这份文档保留为历史草稿，不是当前正式真相源。

当前正式定义见：

- [Environment Model](./environment-model.md)
- [Local Dev Runbook](./local-dev-runbook.md)
- [Synology Deployment](./synology-deployment.md)

## 目标

AI agent 直接操作生产环境有风险，但本地测试又需要真实数据。两套环境隔离解决。

## 架构

```
生产群晖 (真人用)              本地 Mac (AI 测试)
  │                               │
  │  ← 单向同步 pg_dump ────────  │
  │  ← 单向同步 mc mirror ──────  │
  │                               │
  Postgres + MinIO            Postgres(Docker) + MinIO(Docker)
  Backend + Frontend          Backend(:3100) + Frontend(:5173)
  ↑                               ↑
  真人操作                       本地 CLI / agent 测试流量
```

## 原则

- 同步单向：生产 → 本地，本地改什么都不会回传
- 本地可脱敏：同步时替换真实邮箱、清除密码，防止敏感数据泄露
- 生产不接 AI：第一阶段生产只跑纯净 IM，AI 在本地测

## 两步走

1. **部署生产**：本机构建镜像并上传到群晖，群晖执行 `docker load + docker compose up -d`
2. **同步 + 测 AI**：拉生产数据到本地，本地另起 IM，AI agent 连本地

## 同步命令（草稿）

```bash
# Postgres
ssh synology "pg_dump ..." | docker exec -i postgres psql

# MinIO
mc mirror synology/local local/synology
```
