# ADR 0005: Server 使用稳定 ID

- Status: Accepted
- Date: 2026-08-11

## Decision

把工作区 Server 建模为独立实体。普通频道通过 `Group.serverId` 外键归属 Server；名称、头像和归档状态属于 `Server`，不再承担实体身份。

迁移采用 expand → backfill → compatibility → contract：兼容期继续返回并同步 `Group.category`，旧 `Category` 表也保留。只有在旧客户端调用量为零、生产备份和恢复演练完成，并经历至少一个稳定发布周期后，才可单独发布删除旧字段的破坏性迁移。

## Why

名称会变化，不能安全地作为导航键、缓存键、对象存储路径或外键。稳定 ID 让重命名成为单行更新，并保证选中状态、权限、头像和频道归属不随显示名称变化。

## Consequences

- 新客户端和业务逻辑必须使用 `serverId`；`category` 只用于显示兼容和旧客户端输入。
- DM 的 `serverId` 保持 `null`；普通频道在扩展期由迁移和写入服务保证非空，数据库 `NOT NULL` 约束留到 contract 发布。
- Server 批量归档通过 durable outbox 扇出，并复用频道归档 application service，避免长事务和规则分叉。
- Server 名称当前按规范化后的精确字符串唯一；同名重命名会失败，不会合并实体。
