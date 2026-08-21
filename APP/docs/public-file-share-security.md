# 公开文件分享安全边界

## 密码兼容策略

- 新建、重新开启和轮换分享使用 16 位字母数字密码，且至少包含大写字母、小写字母和数字。
- 管理接口只接受 12～64 位的新策略密码。
- 已经存在的四位密码在原分享过期前仍可通过公开解锁接口验证；修改分享设置时，前端会自动生成新策略密码，服务端不会继续保存四位密码。
- 分享密码、公开 token、下载 session 均不得写入日志。

## 暴力破解控制

失败状态存放在 PostgreSQL，而不是单个 backend 进程内。主键维度为：

- 公开 token 的 SHA-256 摘要；
- 使用 `FILE_ACCESS_SECRET` HMAC 后的客户端地址指纹。

单个分享/客户端连续失败 5 次进入 15 分钟锁定，后续锁定时间指数增长。单个客户端在不同 token 上累计失败 30 次也会进入全局锁定，从而限制 token spraying。成功只清除对应分享/客户端的失败状态，不会清除客户端的全局风险状态。过期且未锁定的风险记录保留 30 天后清理。

## 可信代理链

backend 只信任 `TRUSTED_PROXY_CIDRS` 明确列出的直接代理。未配置时采用 fail-closed：忽略 `X-Forwarded-For`，只使用 TCP 对端地址。

正式 compose 为 frontend Nginx 和 backend 分配固定应用网络地址，默认只信任 frontend 的 `172.29.0.10/32`。如部署环境需要调整网段，必须同时修改：

- `APP_NETWORK_SUBNET`
- `FRONTEND_PROXY_IP`
- `BACKEND_IP`
- `TRUSTED_PROXY_CIDRS`（应精确到 frontend 代理地址）

Nginx 必须用 `$remote_addr` 覆盖 `X-Forwarded-For`，不得透传客户端自带的同名请求头。该设置遵循 Express 对可信代理拓扑的要求；不要把 `trust proxy` 设为无条件 `true`。

## 安全日志

公开解锁日志只包含 `shareId`（成功时）、token 摘要前缀 `shareRef`、`requestId` 和结果。任何排障工具、代理 access log 或崩溃报告都不得记录请求体。
