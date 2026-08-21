# Database Migration and Rollback Runbook

数据库迁移不是“启动 backend 时顺手执行”的动作，而是发布中的独立变更。正式入口是
`deploy/synology/release.sh` 触发的 one-shot `migrate` service。

## 默认规则

1. 所有迁移使用 expand-contract：先加表/列/索引和兼容读写，确认旧客户端为 0 后再单独删除旧结构。
2. 发布前必须有完成校验和的 PostgreSQL 备份。
3. migration 运行时旧应用继续服务；migration 返回非零时立即终止发布，新应用不得启动。
4. backend 镜像启动命令只启动 Node，不执行 Prisma migration。
5. 应用回滚不自动回滚数据库，也不停止 PostgreSQL/MinIO。

## 为什么不能承诺所有数据库修改都自动回滚

应用代码可以通过切回旧镜像快速回滚；数据库迁移一旦包含数据重写、删除字段或不可逆转换，简单执行
“down migration”可能造成二次丢数。因此策略分三类：

- expand 迁移失败：PostgreSQL 的事务性 DDL 会回滚该迁移；修复迁移后重试，旧应用继续运行。
- expand 已成功、应用失败：切回仍兼容新 schema 的旧应用，保留新增结构和数据。
- destructive/contract 迁移失败或需要撤销：停止写入，使用发布前备份恢复到新实例并校验，再切换；不得由脚本盲目覆盖生产库。

Prisma 的数据迁移应拆成 expand、数据回填、contract 三个可审查步骤；自定义 SQL 必须先生成并检查，
不得直接在生产使用 `migrate dev`。参考 Prisma 官方的
[data migration 指南](https://docs.prisma.io/docs/guides/database/data-migration) 和
[customizing migrations](https://docs.prisma.io/docs/orm/prisma-migrate/workflows/customizing-migrations)。

## 发布前检查

- 新旧应用版本都能读取 expand 后 schema。
- 迁移 SQL 不含未批准的 `DROP`、整表重写或无界数据更新。
- 大表索引采用适合 PostgreSQL 的在线/分阶段方式，并记录锁时间预算。
- 热表使用 `CREATE INDEX CONCURRENTLY` 时，每个 migration 文件只放一个并发建索引语句，避免被
  migration runner 合并进事务；必须在隔离 PostgreSQL 上用实际 `migrate deploy` 从空库验证。
- 并发建索引失败后先检查 `pg_index.indisvalid`；无效索引必须由人工确认名称后删除，再按 Prisma
  failed-migration 流程处理，不能用 `IF NOT EXISTS` 跳过无效索引。
- 本地空库运行全部迁移成功。
- 从生产备份恢复到本地隔离库后，完整演练 migrate、启动新应用、切回旧应用。
- 记录迁移前后的关键表计数、约束校验和耗时。

## 生产发布

`release.sh` 固定执行：compose 边界校验 → `backup.sh` → Prisma validate → `migrate deploy` →
backend readiness → frontend。任何前置步骤失败都不会启动新应用。

## 事故恢复

恢复备份属于破坏性操作，必须人工确认目标数据库、备份 checksum、恢复点和可接受的数据丢失窗口。
推荐恢复到新的 PostgreSQL database/container，完成 schema、行数和业务 smoke 校验后再切换连接，而不是
直接覆盖当前数据目录。恢复完成后保留故障库只读副本，直到数据核对结束。
