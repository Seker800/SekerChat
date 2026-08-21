# Realtime 发布契约

Realtime 事件的唯一类型与运行时校验来源是 `packages/contracts/src/index.ts`。后端、Web 前端和 Reminder 必须依赖 `@sekerchat/contracts`，不得在各应用内复制事件 envelope 或事件名联合类型。

阅读状态使用 `message.read-cursor.changed.v1`。游标是群组内单调递增的 `eventSequence` 字符串：客户端只上报当前确实可见的最新消息，服务端只允许向前推进。在线状态和阅读游标事件应优先就地更新查询缓存；HTTP 查询仍是事实来源，仅在断线重连或局部更新失败时回源校正。

## Envelope

所有事件必须包含：

- `eventVersion`: 当前固定为 `1`；
- `eventId`: 稳定且非空的事件标识；
- `type`: 自带版本后缀的判别字段，例如 `message.created.v1`；
- `groupId`: 不属于群组的全局事件使用空字符串；
- `occurredAt`: ISO 时间；
- `payload`: 由 `type` 决定的对象。

后端在序列化前调用共享校验器。Web 前端只允许校验成功的数据进入 TanStack Query cache；未知版本或畸形事件只记录分类与原因，不记录原始 payload，并通过 query invalidation 恢复服务端事实。Reminder 对 WebSocket 和 HTTP 补拉使用同一校验器。

## 演进规则

1. payload 只增加可选字段时，保持现有事件版本。
2. 删除字段、改变含义或收紧必填条件时，新建 `*.v2`，不得原地修改 `*.v1`。
3. 新消费者应先上线对新旧版本的兼容读取，再切换后端发布版本；确认旧消费者为零后，才可删除旧解析分支。
4. 每个新版本必须同时增加共享 contract test、发布端测试和至少一个消费端的拒绝畸形数据测试。

Android 无法直接加载 TypeScript 包，因此它只读取已知 `eventVersion/type`，未知版本一律忽略；对应 Java 构建是契约发布门禁的一部分。
