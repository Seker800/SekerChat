# API Capabilities Guide

这份文档只描述当前 IM 主链仍然存在的接口。

不再覆盖已删除的聚合接口、兼容接口和历史控制面。

## 1. Quick map

- 健康检查：`GET /api/health`
- 登录与会话：`/api/auth/*`
- 用户：`/api/users`
- Bot 管理：`/api/admin/bots`
- 公开 bot 列表：`/api/bots`
- 群组：`/api/groups`
- 消息：`/api/groups/:groupId/messages`
- 文件附件：`/api/groups/:groupId/files/*`
- 群产物：`/api/groups/:groupId/artifacts/*`
- 群工作状态：`/api/groups/:groupId/work-state`
- reminder 实时事件：`GET /api/realtime/events`

## 2. Typical flow

最小登录链路：

```text
POST /api/auth/request-code
POST /api/auth/verify-code
GET  /api/users/me
GET  /api/groups
```

进入群后的常见链路：

```text
GET  /api/groups/:groupId
GET  /api/groups/:groupId/messages
GET  /api/groups/:groupId/work-state
GET  /api/groups/:groupId/artifacts
```

## 3. Endpoints

### 3.1 Health

- `GET /api/health`

用途：

- 判断 HTTP 服务是否启动

### 3.2 Auth

- `POST /api/auth/request-code`
- `POST /api/auth/verify-code`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/users/me`
- `GET /api/auth/oidc/login`
- `GET /api/auth/oidc/callback`
- `POST /api/auth/oidc/implicit/complete`
- `POST /api/auth/reminder/verify-code`

返回重点：

- `verify-code` / `refresh` 返回 `accessToken`、`refreshToken`、`user`
- `me` 返回当前登录用户

### 3.3 Users

- `GET /api/users`
- `GET /api/users/dm-candidates`
- `PATCH /api/users/:userId/role`
- `PATCH /api/users/:userId/disabled`
- `DELETE /api/users/:userId`

用途：

- 列出普通用户目录
- 列出可发起私聊的候选用户
- 调整普通用户的全局角色
- 停用或注销普通用户

边界：

- `Agent Bot` 不属于普通用户管理域
- bot 的身份与配置修改必须走 `Bot 管理` 入口

### 3.4 Bot Admin

- `GET /api/admin/bots`
- `POST /api/admin/bots`
- `PATCH /api/admin/bots/:botId`
- `DELETE /api/admin/bots/:botId`
- `POST /api/admin/bots/:botId/avatar`
- `GET /api/bots`

用途：

- 管理 `Agent Bot` 的身份、配置和头像
- 给聊天入口列出当前可见 bot

边界：

- `Agent Bot` 复用 `User` 模型，但不通过 `用户管理` 入口维护
- 会改变 bot 身份或运行配置的动作，必须走 `/api/admin/bots/*`

### 3.5 Groups

- `POST /api/groups`
- `GET /api/groups`
- `GET /api/groups/:groupId`
- `PATCH /api/groups/:groupId`
- `DELETE /api/groups/:groupId/leave`
- `PATCH /api/groups/:groupId/archive`
- `POST /api/groups/:groupId/members`
- `PATCH /api/groups/:groupId/members/:memberUserId/role`
- `DELETE /api/groups/:groupId/members/:memberUserId`
- `GET /api/groups/admin/discovery`
- `GET /api/groups/admin/categories`
- `PATCH /api/groups/admin/categories`
- `DELETE /api/groups/admin/categories`
- `POST /api/groups/:groupId/admin/join`

返回重点：

- 群成员
- 归档状态
- 分类
- 当前用户角色

### 3.6 Messages

- `GET /api/groups/:groupId/messages`
- `POST /api/groups/:groupId/messages`

支持：

- 文本消息
- 图片 / 文件附件消息
- 回复消息
- mention 用户

### 3.7 Files

- `POST /api/groups/:groupId/files/upload`
- `GET /api/groups/:groupId/files/:fileId`
- `GET /api/groups/:groupId/files/:fileId/content`

用途：

- 聊天附件上传与下载

### 3.8 Artifacts

- `GET /api/groups/:groupId/artifacts`
- `POST /api/groups/:groupId/artifacts/upload`
- `GET /api/groups/:groupId/artifacts/:artifactId`
- `GET /api/groups/:groupId/artifacts/:artifactId/content`
- `DELETE /api/groups/:groupId/artifacts/:artifactId`

用途：

- 保存群相关产物
- 下载和删除群产物

### 3.9 Group Work State

- `GET /api/groups/:groupId/work-state`
- `PATCH /api/groups/:groupId/work-state`

用途：

- 读取当前群工作状态
- 维护当前群工作状态与原因

### 3.10 Realtime

- `GET /api/realtime/events`

认证：

- 使用 `x-reminder-device-token`

用途：

- 给 reminder 设备拉取实时事件流

## 4. Minimal checks

判断 API 是否可用：

1. `GET /api/health`
2. `POST /api/auth/request-code`
3. `POST /api/auth/verify-code`
4. `GET /api/users/me`
5. `GET /api/groups`

判断群工作台数据是否可用：

1. `GET /api/groups`
2. `GET /api/groups/:groupId`
3. `GET /api/groups/:groupId/messages`
4. `GET /api/groups/:groupId/work-state`
5. `GET /api/groups/:groupId/artifacts`

判断 reminder realtime 是否可用：

1. `POST /api/auth/reminder/verify-code`
2. `GET /api/realtime/events` with `x-reminder-device-token`

## 5. Source of truth

若文档和实现冲突，以当前代码为准：

- `APP/apps/backend/src/auth/*`
- `APP/apps/backend/src/users/*`
- `APP/apps/backend/src/groups/*`
- `APP/apps/backend/src/messages/*`
- `APP/apps/backend/src/files/*`
- `APP/apps/backend/src/artifacts/*`
- `APP/apps/backend/src/ops/*`
- `APP/apps/backend/src/realtime/*`
