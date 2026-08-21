# Bot User Boundary

这份文档只描述当前仓库里 `Agent Bot` 与普通用户的边界归属。

目标只有一个：

- 避免同一条 `User` 记录同时被 `Bot 管理` 和 `用户管理` 以不同语义改写

## 1. Current model

当前 `Agent Bot` 不是独立表，而是 `User` 表中的特殊用户。

判定条件：

- `role === CLI_BOT`
- `isBot === true`
- `disabledAt === null` 时视为启用中的 bot

对应实现：

- 后端判定：[bot-identity.ts](../apps/backend/src/common/bot-identity.ts)
- bot 管理接口：[bots.controller.ts](../apps/backend/src/bots/bots.controller.ts)
- bot 管理 UI：[BotSection.tsx](../apps/frontend-react/src/components/admin/BotSection.tsx)

## 2. Ownership rules

### 2.1 Bot 管理 owns bot identity

以下内容只允许通过 `Bot 管理` 入口维护：

- bot 的创建
- bot 的显示名
- bot 的头像
- bot 的 `botConfig`
- bot 的启用集合
- bot 的删除/停用

对应接口：

- `GET /api/admin/bots`
- `POST /api/admin/bots`
- `PATCH /api/admin/bots/:botId`
- `DELETE /api/admin/bots/:botId`
- `POST /api/admin/bots/:botId/avatar`

### 2.2 用户管理 does not own bot identity

`用户管理` 只负责普通人类用户，不负责 bot。

不允许通过 `用户管理` 做这些事：

- 把 bot 改成 `ADMIN` / `MEMBER`
- 停用 bot
- 注销 bot

对应约束：

- 后端拒绝通过 `users` service 改写 bot：
  [users.service.ts](../apps/backend/src/users/users.service.ts)
- 前端 `用户管理` 不再展示 bot：
  [UserManagementSection.tsx](../apps/frontend-react/src/components/admin/UserManagementSection.tsx)

## 3. Why this rule exists

如果 bot 同时暴露给 `Bot 管理` 和 `用户管理`：

- 两个入口会写同一条 `User` 记录
- 两边的语义并不一致
- bot 的关键身份字段可能被普通用户管理动作改坏

典型风险：

- `role` 被改成 `ADMIN`
- `isBot` 被改成 `false`
- `disabledAt` 被普通停用流程写入

一旦发生上述情况，bot 不一定报错，但会从 `Bot 管理` 列表中消失，形成“bot 被改没了”的表象。

## 4. Review checklist

涉及 bot 或用户管理改动时，review 至少检查这几项：

1. bot 是否仍只由 `Bot 管理` 写入
2. `用户管理` 是否重新把 bot 暴露成可编辑对象
3. 是否有新逻辑会改写 bot 的 `role`、`isBot`、`disabledAt`
4. bot 列表条件和 bot 身份判定是否仍一致

## 5. Current policy

当前项目的执行口径是：

- bot 复用 `User` 模型
- 但 bot 不属于普通用户管理域
- 凡是会改变 bot 身份或运行配置的操作，都必须收口到 `Bot 管理`
