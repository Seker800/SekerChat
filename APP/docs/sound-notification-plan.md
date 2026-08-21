# 消息声音提醒方案

## 现状

好消息：声音提醒需要的基础设施基本都有了。

- **WebSocket 实时推送**：`useRealtime.ts` 已监听 `message.created` 事件，消息到了前端立即可知
- **@提及检测**：后端 `messages.service.ts` 已解析 `@token` 并写入 `mentionedUserIds` 字段，前端能拿到当前用户是否被提及
- **TanStack Query**：消息列表走缓存，WebSocket 事件触发自动刷新

缺的只是：收到消息 → 判断条件 → 发出声音 这最后一步。

## 方案

### 声音生成

用 Web Audio API 合成，不依赖外部文件。Discord 就是这么做的。

- **普通消息**：短促单音 "叮"，300ms，800Hz 左右
- **@提及**：三连音，更突出，或者重复播放 "叮叮叮"

好处：零依赖、文件体积极小、音量可控。

### 触发流程

```
WebSocket message.created
  → 检查通知开关（用户是否关闭）
  → 检查时间段（默认 8:30-18:00，外不发声音）
  → 检查当前标签页可见性（如果正看着这个频道，不响）
  → @提及 → 强提醒音
  → 普通消息 → 轻提示音
```

### 时间段设置

存在服务端，由管理员统一配置。所有用户自动继承，不需要各自设置。

这里的 `quietStart` / `quietEnd` 历史命名容易误导，但当前真实语义是：

- 它们表示“允许播放通知音的时间窗”
- 默认 `08:30-18:00`
- 在时间窗外静音
- 它们不是“免打扰时段”的起止时间

- **存储**：新增 `SystemConfig` 表（key-value 结构，后续其他系统配置也可用）
- **API**：`GET /api/system-config` 所有用户可读，`PATCH /api/system-config` 仅管理员可写
- **默认值**：首次部署时自动写入 `quietStart: 08:30` / `quietEnd: 18:00`
- **前端**：启动时 fetch 一次，缓存到当前会话，不需要每次请求

以后如果有用户想覆盖（比如夜猫子想开晚一点），再加一层 `UserConfig` 表做个人覆盖即可，这是后话。

```
管理员 → 后台设置时间段 → 写入 SystemConfig 表
所有用户 → 打开 IM → GET /api/system-config → 获得时间段
```

### 修改范围

| 文件 | 改动 |
|------|------|
| **Backend** | |
| Prisma schema | 新增 `SystemConfig` 模型 |
| `system-config.module.ts` | 新建，CRUD 模块 |
| `system-config.controller.ts` | 新建，GET/PATCH 接口 |
| **Frontend** | |
| `useRealtime.ts` | 新增 `onMessageCreated` 回调参数 |
| `useNotification.ts` | 新建，核心逻辑：条件判断 + 播放声音 |
| `useNotificationSettings.ts` | 新建，从 API 获取时间段 |
| `NotificationSettingsPanel.tsx` | 新建，管理员设置面板 |
| `WorkspaceShell.tsx` | 挂载 useNotification hook |

## 边界

- 不在时间段内：静音，不丢消息，只是不响
- 标签页可见 + 正在看对应频道：不响
- 浏览器不支持 Web Audio API（极老浏览器）：静音，不报错
- @提及检测：仅匹配 `@displayName` 和 `@email` 前缀，按后端现有逻辑

## 调试

- 浏览器控制台执行 `localStorage.setItem('debug:sound', '1')` 后刷新页面，可输出声音决策与 Web Audio 初始化日志
- 调试完成后执行 `localStorage.removeItem('debug:sound')` 关闭日志
