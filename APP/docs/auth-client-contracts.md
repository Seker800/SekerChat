# 认证客户端契约

SekerChat 的浏览器、CLI 和 Reminder 使用不同的认证边界。服务端可以共享会话签发逻辑，但传输契约不能混用。

## 浏览器

- 端点前缀：`/api/auth/browser/*`
- 凭据：仅 `HttpOnly` Cookie；前端请求统一使用 `credentials: include`
- 响应：只包含用户或会话元数据，不返回 access token、refresh token
- 刷新：`POST /api/auth/browser/refresh`，只读取 refresh Cookie
- 登出：`POST /api/auth/browser/logout`，只读取 refresh Cookie
- 状态写请求：生产环境必须带允许的 `Origin` 或 `Referer`

浏览器不得把认证凭据写入 `localStorage`、`sessionStorage`、URL、日志或组件 props。

## CLI / 机器客户端

- 端点前缀：`/api/auth/token/*`
- 凭据：响应体返回 access token、refresh token
- 刷新和登出：refresh token 必须放在 JSON 请求体，不使用 Cookie
- 业务 API：使用 `Authorization: Bearer <access token>`

CLI 当前的人类验证码登录、刷新和登出均使用这一端点族。Reminder 继续使用 `/api/auth/reminder/*`；长期设备凭据和 realtime ticket 生命周期见 [`reminder-device-credentials.md`](./reminder-device-credentials.md)。

## 兼容窗口

旧 `/api/auth/login`、`register`、`verify-code`、`refresh`、`logout` 和 OIDC 路径暂时保留到 2026-11-30。每次调用都会：

- 遵守浏览器会话契约，只通过 `HttpOnly` Cookie 传递凭据，响应体不返回 token；
- 返回 `Deprecation: true` 和 `Sunset` 响应头；
- 写入不含请求体、Cookie、token 的 `legacy_auth_endpoint_called` 结构化日志。

删除旧端点前，生产日志必须证明所有旧路径连续 30 天调用量为零。兼容窗口只允许延长，不允许在没有调用量证据时提前删除。
