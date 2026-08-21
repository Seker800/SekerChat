# Reminder 设备凭据与 Realtime Ticket

## 凭据分层

Reminder 使用两级凭据：

1. 长期设备 token：只允许放在 HTTPS 请求头 `x-reminder-device-token` 中，用于 fallback pull 和换取 realtime ticket。
2. 一次性 realtime ticket：32 字节随机值，60 秒有效，只允许消费一次；WebSocket URL 使用 `/realtime?ticket=...`。

长期设备 token 不得进入 URL、代理 access log、应用日志或崩溃报告。生产环境的设备注册、换票、fallback pull、撤销和轮换均由 `ReminderSecureTransportGuard` 强制 HTTPS；本机开发环境可以使用 HTTP。

## API

| 动作 | 端点 | 认证 |
| --- | --- | --- |
| 邮箱验证码注册设备 | `POST /api/auth/reminder/verify-code` | 验证码 + HTTPS |
| 浏览器创建/按名称轮换设备 | `POST /api/auth/reminder/create-device` | 浏览器会话 + Origin + HTTPS |
| 换取 60 秒 ticket | `POST /api/auth/reminder/realtime-ticket` | 长期 token 请求头 + HTTPS |
| 列出自己的设备 | `GET /api/auth/reminder/devices` | 用户会话 |
| 按设备撤销 | `DELETE /api/auth/reminder/devices/:deviceTokenId` | 用户会话 + Origin + HTTPS |
| 按设备轮换 | `POST /api/auth/reminder/devices/:deviceTokenId/rotate` | 用户会话 + Origin + HTTPS |

轮换会撤销同一用户、同一设备名下的旧 token，并只在响应中返回一次新 token。设备记录保留 `lastUsedAt`，每次长期 token 成功认证时更新。

## 原子消费与故障语义

服务端只保存 ticket 的 SHA-256 摘要。消费通过 PostgreSQL 条件更新完成，条件同时要求：未消费、未过期、所属设备未撤销。并发请求只能有一个更新成功；过期、重放或已撤销设备的 ticket 都以 WebSocket `4401 Unauthorized` 关闭。

Desktop 和 Android 每次初连或重连都会先通过 HTTPS 获取新 ticket。旧的 `/realtime?deviceToken=...` 已删除，不提供兼容读取，避免长期凭据继续出现在 URL。
