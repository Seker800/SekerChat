# ADR 0008: 领域词汇与代码命名

- Status: Accepted
- Date: 2026-11-16

## Decision

全仓库统一使用以下词汇，新代码不得引入同义词：

| 概念 | 代码名 | 说明 |
|---|---|---|
| 服务器（工作区容器） | `Server` / `serverId` | 稳定身份，见 ADR 0005 |
| 频道（Server 下的会话） | `Group` / `groupId` | 数据库与 API 的主名 |
| 私聊会话 | `Dm` / `dmId` | 只在私聊语境使用 |
| 用户可见的“频道”文案 | `Channel` | 仅存在于 UI 文案与少数历史组件名 |

`Category` 是 ADR 0005 迁移期的兼容字段与旧表。允许继续出现在：

- Prisma 的 `Group.category`、`Category` 模型及其迁移
- 为旧客户端保留的 `admin/categories` HTTP 路由
- 一次性的数据回填脚本

禁止出现在新的 service、hook、组件、类型和前端状态字段中。已有代码按模块逐步收敛，收敛完成前不得扩大使用面。

## Why

同一个对象同时叫 `Group`、`Server`、`Category`、`Channel`，导致 `GroupCategoryService` 与 `ServersService` 出现一一对应的方法，阅读代码需要在四个名字之间持续翻译。词汇统一后，调用链可以直接按名字定位。

## Consequences

- 前端 `useServerCategories` / `categoryGroups` 这类命名要改为 `useServerTree` / `serverGroups`。
- 后端 `GroupCategoryService` 的职责并入 `ServersService`；HTTP 路由保留兼容别名，按 expand → contract 下线。
- 工具页（出勤、月报、文章、相册）不属于私聊，不再使用 `Dm` 前缀和 `/dm/` 路由。
- 新增模块边界检查规则，阻止新代码 import 迁移期服务。
