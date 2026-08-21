# Server 稳定身份迁移手册

## 当前阶段

当前只发布 expand/backfill/compatibility，不执行破坏性 contract：

- 新增 `Server` 表和 nullable `Group.serverId`；
- 回填所有非 DM 频道，并建立外键；
- 保留 `Group.category` 与 `Category`；
- 新写入以 `serverId` 为准，并同步旧 category；
- API 同时返回新旧字段。

## 发布前检查

1. 确认 `DATABASE_URL` 指向本机恢复库或目标维护环境，开发命令不得指向群晖生产数据面。
2. 在备份/恢复副本执行 `npx prisma migrate deploy --schema prisma/schema.prisma`。
3. 用 `prisma/validation/server-backfill.sql` 验证：非 DM 空引用、DM 非空引用、孤儿引用和重名行都为 0。
4. 对比迁移前后的 Group、GroupMember、Message 总数；本迁移不得改变这些表的行数。
5. 记录数据规模、迁移开始/结束时间和校验结果，再安排生产维护窗口。

## 失败与回滚

Prisma 在 PostgreSQL 中以事务执行本迁移。建表、回填、校验或外键任一步失败时，整个 migration 回滚，旧应用继续使用 `Category/category`。

迁移成功但新应用异常时，只回滚应用版本：旧表和旧列仍在，新 schema 是向后兼容的，不删除 `Server/serverId`，也不反向改写业务数据。暂停 Server lifecycle outbox worker，确认旧应用健康后再分析失败原因。

只有未来的 contract 迁移会删除旧字段。它必须满足：完整备份可恢复、旧客户端调用量为 0、生产快照升级/应用回滚演练通过、至少一个稳定发布周期完成。contract 迁移失败时从备份恢复，而不是编写猜测性 down migration。

## 本机校验命令

```bash
cd APP/apps/backend
npx prisma migrate status --schema prisma/schema.prisma

# 使用本机 Docker PostgreSQL 执行只读校验
docker exec -i sekerchat-dev-postgres \
  psql -U postgres -d sekerchat_dev \
  < prisma/validation/server-backfill.sql
```

校验结果中的三个计数必须为 `0`，重名查询必须返回空结果。
