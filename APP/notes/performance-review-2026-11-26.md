# SekerChat 运行效率复核（2026-11-26）

- 版本：生产 `v0.9.30`（NAS 上 4 个容器已连续运行 4 天+）
- 范围：后端请求路径、前端数据加载与渲染、数据库/索引、后台任务、nginx 传输
- 方式：只读。生产侧只执行 `SELECT` / `EXPLAIN (ANALYZE, BUFFERS)`、读容器日志与 `nginx -T`、`docker stats/inspect`；本机侧用真实前后端复现请求并统计。未改生产配置、未写生产库、未部署。
- 基线数据：17 用户 / 123 群 / 327 成员关系 / 6,576 条消息 / 库 38 MB；24h 内后端处理约 4.3 万个请求。

---

## 一、结论

不是“数据库变慢了”，也不是“查询写错了”。当前最明显的效率损失集中在五处，且互相放大：

| 排名 | 问题 | 性质 | 证据 |
| --- | --- | --- | --- |
| 1 | 头像按“每个头像组件一次”重新下载，且服务端返回原图 | 前端 + 缓存 + 图片处理 | 24h 内 5 张头像产生 **511 次请求 / 186 MB**，平均 373 KB/次，0 次 304 |
| 2 | 每次切频道都重拉整个工作区，消息还拉两遍 | 前端请求编排 | `/workspace/bootstrap` 267 次/天，平均 **140 KB**、p50 **126–139 ms**，响应里的 groups/dms 在首次挂载后基本被丢弃 |
| 3 | 群列表为了 95 行“最后一条消息”，把 6,440 条消息全读进 Node | 后端查询 | Prisma 对嵌套 `take: 1` 不生成 `LIMIT`，生产 EXPLAIN 6,440 行 / 1.1 MB 排序 / 11.8 ms |
| 4 | 任意群的新消息都会重渲染当前频道，且 `MessageItem` 的 memo 被内联回调废掉 | 前端渲染 | 向另一个群发 5 条消息 → 当前频道 5 次 commit、250 次 MessageItem 重渲染、188 ms script（dev 实测） |
| 5 | 真正落盘的写操作仍在等 HDD 的 fsync | 基础设施 | 发消息 p50 **393 ms**、上传完成 p50 **875–918 ms**、刷新令牌 p50 **513–655 ms**；同样的心跳加了 `synchronous_commit=off` 后只要 1–4 ms |

一句话：**读操作本身很快，慢在“重复读”和“重复传”；写操作本身不慢，慢在等磁盘。** 前 3 项都是纯软件浪费，不需要换硬件就能大幅改善。

---

## 二、P0：现在就能明显感觉到的浪费

### P0-1 头像：5 张图，24 小时下载了 186 MB

生产 nginx 日志实测：

```
/api/avatars/users/:id/content   511 次/24h   总 186 MB   平均 373 KB   最大 516 KB   304 = 0
按 URL 去重后只有 5 个不同头像：
  292a3694…  268 次
  567bd1e8…  131 次
  d1a807da…   67 次
  c12655c0…   43 次
```

原因有三层，叠加后非常浪费：

1. **每个 `<Avatar>` 实例各发一次请求**，没有模块级缓存，也没有 in-flight 合并。
   `apps/frontend-react/src/components/shared/Avatar.tsx:31-81`：每次挂载都 `fetch` → `blob` → `URL.createObjectURL`，30 个头像就是 30 个不同的 blob URL、30 次解码。
   本机实测：打开一个有 50 条消息的频道，首屏 55 个 API 请求，其中同一个头像/QQ 头像文件被请求 **29 次**。
2. **服务端只给 5 分钟缓存且没有 ETag**。
   `apps/backend/src/avatars/avatars.controller.ts:47`：`Cache-Control: private, max-age=300`，`StreamableFile` 不带 `ETag`，所以过期后只能整包重下，永远不会有 304。
   头像 URL 已经带 `?v=<storageKey>`（`avatars.service.ts:57-62`），内容实际是不可变的。
3. **头像存的是上传原图，按 40px 显示**。
   `apps/backend/src/avatars/avatars.service.ts:31-43` 直接 `uploadBufferToS3(file.buffer)`，没有缩放；生产平均 373 KB、最大 516 KB 的图，被用在 32–48px 的位置。项目已经依赖 `sharp`，完全可以在上传时生成 128–256px 的版本。

**最小修复**
- 前端：模块级 `Map<url, {promise, objectUrl, refs}>`，相同 URL 共享一次请求和同一个 object URL；或在 cookie 会话下直接用 `<img src>` 交给浏览器缓存。
- 后端：给头像响应加 `ETag`（storageKey 即可）并把缓存改成 `private, max-age=31536000, immutable`。
- 上传时用 `sharp` 生成 128/256px 版本，列表/消息只取缩略版本，原图另存。

预期：这 186 MB/天 可以降到个位数 MB，切频道时也不会再出现“几十个头像同时打后端”。

### P0-2 切频道重拉整个工作区，消息还拉两遍

`apps/frontend-react/src/components/workspace/useWorkspaceQueries.ts:56-67`：

```ts
queryKey: ['workspace-bootstrap', mode, isDmSpecialPage ? '' : requestedRouteGroupId]
```

queryKey 里带了 `groupId`，所以每切一个频道就是一个新 query，会重新请求：

```
GET /api/workspace/bootstrap?mode=server&groupId=<新频道>&messageLimit=50
```

这个响应包含 `groups`（所有群 + 所有成员）+ `dms` + `systemConfig` + 当前频道 50 条消息。生产实测 267 次/天、平均 **140 KB**、p50 126–139 ms。

但前端只真正消费了它的 `messages` 和首次挂载时的 `initialData`：

- `groups` / `dms` 作为 `serversQuery` / `dmsQuery` 的 `initialData`（`:71-88`）。React Query 的 `initialData` **只在 query 第一次创建时生效**；切频道时 query 已存在，所以新响应里的 groups/dms 被直接丢弃。
- `messages` 作为 `useMessageList` 的 `initialData`（`useWorkspaceShellModel.ts:270-277`）。但本页首次渲染时 bootstrap 还没返回，`initialData` 是 `undefined`，`['messages', groupId]` 已经自己发起请求；等 bootstrap 返回，query 已存在，`initialData` 同样被忽略。

结果本机实测：首屏和每次切频道都会出现

```
GET /api/workspace/bootstrap?...  56 KB（含 50 条消息）
GET /api/groups/:id/messages?...  47 KB（同样 50 条消息）
```

**同一份消息下载两遍**，另外还多传了一份 95 个群的列表。

**最小修复**
- bootstrap 不再按频道分 key，也不再携带消息：`queryKey: ['workspace-bootstrap', mode]` + `includeMessages: false`；消息完全交给 `['messages', groupId]`。这样两个请求可以并行，切频道只发 1 个消息请求。
- 或保留首屏 bootstrap 带消息，但让 `useMessageList` 在 bootstrap 未返回时不要抢先发请求（用 `enabled` 等），并保证后续切频道不再重拉 bootstrap。
- 删除三处对 `['workspace-bootstrap']` 的无效 invalidate（见 P1-5）。

### P0-3 群列表为了“最后一条消息”读全表

`apps/backend/src/groups/group-types.ts:48-56`：

```ts
messages: {
  orderBy: { createdAt: 'desc' },
  take: 1,
  select: { text: true, senderId: true, type: true },
}
```

Prisma 对嵌套 `take: 1` 的实现**不是** SQL 的 `LIMIT 1`。本机用同版本 Prisma 打开 query log，实际 SQL 是：

```sql
SELECT ... FROM "Message"
WHERE "groupId" IN ($1,...,$95)
ORDER BY "createdAt" DESC
OFFSET $96
```

没有 LIMIT。生产 EXPLAIN（95 个群）：

```
Sort  rows=6440  Memory: 1093kB  actual time=11.8 ms
```

也就是说，`GET /groups`、`GET /dm`、`/workspace/bootstrap`、`GET /groups/:id` 每次都要把该用户所有群的消息读出来、排序、传到 Node，再在 JS 里每组取第一条。现在 6,576 条消息时是 11.8 ms；消息到 10 万条时，这个查询会线性涨到几百毫秒，而且它每次切频道都要跑 1–2 遍。

**最小修复（不改表结构）**：把 latest message 从 `groupWithMembersSelect` 里拿掉，单独用一条 LATERAL 查询按 `(groupId, createdAt)` 索引取每组 1 条，再合并进 presenter。生产实测：

```
Nested Loop Left Join + Limit
  -> Index Scan Backward using "Message_groupId_createdAt_idx"
Execution Time: 2.09 ms（106 个群），且不随历史增长
```

彻底方案是给 `Group` 加 `latestMessageText/SenderId/Type` 字段，在发消息的同一个事务里更新，读的时候 O(1)；但需要迁移和回填，先用 LATERAL 就能拿到大部分收益。

### P0-4 写操作在等磁盘，上传完成一个动作提交多次

生产日志（24h）：

| 接口 | 次数 | p50 | p95 | max |
| --- | --- | --- | --- | --- |
| `POST /groups/:id/messages` | 47 | **393 ms** | 834 | 1,176 |
| `POST /uploads/:id/complete` | 20 | **875 ms** | 1,353 | 1,504 |
| `POST /uploads/initiate` | 22 | **440 ms** | 979 | 1,169 |
| `POST /auth/browser/refresh` | 12 | **513 ms** | 1,139 | 1,319 |
| `PATCH /groups/:id/read-cursor` | 149 | 8 ms（无变化）/ **459 ms p95**（有写入） | 459 | 1,003 |
| `POST /qq-bridge/heartbeat` | 14,420 | **1 ms** | 5 | 27 |

`read-cursor` 的双峰是最干净的对照：同一条代码路径，不写库 8 ms，写库 459 ms。`heartbeat` 加了 `SET LOCAL synchronous_commit = off`（`qq-bridge-connector.controller.ts:96`）后从几百毫秒降到 1–4 ms。生产 Postgres 的 checkpoint 数据也支持这个结论：每次 checkpoint 只写约 20 个脏页（160 KB），却要 2 秒写入 + 665 ms 同步。

这是硬件（RAID5 机械盘）问题，软件侧能做的是**减少每个用户动作需要落盘的次数**：

- `uploads.service.ts:398` 先 `updateMany(completionParts)`，S3 完成后再 `updateMany(ASSEMBLED)`（`:438`），最后 `finalizeUploadTransaction`（`:552`）再提交一次。一次上传完成至少 3 次 fsync，这就是 875–918 ms 的来源。可评估把前两次状态更新合并/后移（S3 对象已存在时重试是幂等的），至少把“可恢复的簿记状态”用同步提交关掉。
- 发消息事务里除了消息本身，还更新 `Group.updatedAt`、发送者的 `GroupMember.lastReadEventSequence`（`messages.service.ts:191-198`），再加 QQ 桥接的 2 条查询（`qq-bridge-delivery.service.ts:43-51`，即使该群没有启用桥接也会查）。这些不增加 fsync 次数，但拉长事务、增加锁竞争。
- 真正的根治仍然是把 `pg_wal` 放到 SSD；软件层只能把“等盘”的次数和范围压小。

### P0-5 API JSON 完全不压缩

`apps/frontend-react/nginx.conf.template:17-18` 只有：

```nginx
gzip_static on;
gzip_vary on;
```

`gzip_static` 只服务预压缩的静态文件，**对 `/api/` 的 JSON 完全不生效**。生产 `nginx -T` 确认 `gzip on` 是注释状态，`GET /api/health/ready` 带 `Accept-Encoding: gzip` 也没有 `Content-Encoding`。

实测同一份 JSON：

```
/workspace/bootstrap   56,166 B → gzip 6,313 B  (11%)
/groups                 7,294 B → gzip 1,421 B  (19%)
/messages?limit=50     47,176 B → gzip 5,144 B  (10%)
```

生产 `GET /groups` 最大 203 KB、bootstrap 平均 140 KB，压缩后大约是 1/5 – 1/9。对 NAS 家用上行和手机网络，这是每次切频道几百毫秒的差别。

**最小修复**：在 `/api/` 的 location 加 `gzip on; gzip_types application/json; gzip_min_length 1024;`（放在 server 块即可，静态资源已有 `.gz` 不受影响）。

---

## 三、P1：明确的重复行为 / 浪费行为

### P1-1 未读数查询退化成全表扫描

`apps/backend/src/groups/group-query.service.ts:211-228`：先查一次 `groupMember`，再来一条 `LEFT JOIN Message ... COUNT`。

重用户（95 群）生产 EXPLAIN：

```
Seq Scan on "Message"  rows=6576  Buffers: shared hit=246
Hash Right Join ... Rows Removed by Join Filter: 6443
Execution Time: 6.0 ms
```

它是 O(全库消息数)，不是 O(未读数)。改成每组相关子查询后（实测同库）：

```
Index Only Scan using Message_groupId_eventSequence_idx
Execution Time: 0.6 ms   Buffers: 65（原 257）
```

顺带：`:211-215` 的 `groupMember.findMany` 与 raw SQL 里的 `GroupMember` 重复，把 `lastReadEventSequence` 放进 group select 就能删掉一整条查询。

### P1-2 `/dm` 每个私聊一次 `Category.findUnique`

`dm.service.ts:160-164` 调 `serializeGroup` 没传 `prefetch`，`group-presenter.service.ts:41-46` 就为每个 DM 查一次 `Category`。生产 25 个 DM（重用户 11 个），`GET /dm` 要 20 条 SQL、p50 54–59 ms；`/groups` 已经用 `buildGroupSerializePrefetch` 批处理了，这里漏了。

修复：复用同一个 prefetch（DM 的分类都是“私聊”，一次查询就够），或对 DM 直接跳过 category 查询。

### P1-3 消息页 13 条 SQL，且明显 over-fetch

本机用 `messageSelect` 实测：一页 51 条消息（含附件）产生 **9 条 SQL**（Message、FileObject、FilePreviewJob、User、附件 FileObject、附件 preview、FileShare、Group…），加上鉴权、成员校验、`groupBy`、回执成员，整个 `GET /messages` 约 **13 条**；有回复的页更多。

同时 `message-record.types.ts:28-55` 选了序列化根本用不到的字段：`storageKey`、`thumbnailSize`、`attachedAt`；`externalAvatarFile` 拉了整个 `FileObject` + `FilePreviewJob`，序列化时只用 `id/groupId`。

另外 `messages.service.ts:81-92` 的 `groupBy(senderId) + max(eventSequence)` 每次翻页都把整组历史聚合一遍。它只是为了给“每个发送者的最后一条消息”挂已读回执；而旧分页（带 cursor）本来就不需要回执——可以直接从当前页算，删除这条查询。

### P1-4 活动日历每 60 秒轮询一次

`GroupActivityCalendar.tsx:85-90`：`staleTime/refetchInterval = 60_000`。生产 24h **1,432 次**，其中 1,229 次来自同一个用户，1,302 次是 304。

304 只省传输，**后端仍然把整组消息扫了一遍**（`messages.service.ts:121-136`，2.4 ms / 492 行，随历史线性增长）。活动数据只在发消息时变化，而消息已经走 WebSocket；应该去掉定时轮询，改在 `message.created.v1` 时 invalidate，加一个 5 分钟的兜底即可。

### P1-5 三处 `invalidateQueries(['workspace-bootstrap'])` 是纯浪费

- `GroupMuteButton.tsx:33-34`
- `useManagePanel.ts:98`（保存频道设置）
- `useManagePanel.ts:129`（保存工作状态）

这三处都已经手动 `setQueryData` 更新了 `groups/dms/group`，随后又把 bootstrap 整条 invalidate 掉，触发一次 140 KB、126 ms 的请求；而响应里的 groups/dms/messages 如前所述在首次挂载后不会被使用。直接删掉这三行。

### P1-6 `serversQuery` 和 `groupsQuery` 在 server 模式是同一个 query，却被依次 refetch

`useWorkspaceQueries.ts:105-106`：

```ts
const groups = mode === 'dm' ? dms : servers;
const groupsQuery = mode === 'dm' ? dmsQuery : serversQuery;
```

所以 server 模式下 `groupsQuery === serversQuery`。但：

- `useWorkspaceMutations.ts:146-148`（归档 Server）：`await serversQuery.refetch(); await groupsQuery.refetch();`
- `useWorkspaceMutations.ts:166-168`（隐藏 Server）：同样两次
- `useWorkspaceShellModel.ts:484-488`（退出频道）、`:183-186`（加入频道）：`groupsQuery.refetch(); serversQuery.refetch();`

这些操作会让 `GET /groups` 连续跑两遍（每遍 p50 20–97 ms、最大 203 KB），第二遍完全是多余的。保留一个即可。

### P1-7 上传进度把整个工作区重渲染

`multipart-upload.ts:293` 有一个 1 秒的 `setInterval`，但 `upload-transport.ts:47-52` 的 XHR `progress` 事件**每来一次就调用一次 `onProgress`**；`useComposer.ts` 的 `update()` → `setPendingUploadsByGroupId` 是 shell 级 state。也就是说进度事件有多少次，`WorkspaceShell` 就渲染多少次。

本机实测：2 MB 文件、2 Mbps 限速上传 3 秒，产生 **32 次 React commit、792 ms 主线程任务、549 ms scripting**（约占 3 秒墙钟的 26%）。如果同时传 3 个文件，或者机器更慢（NAS 用户常用的手机/旧电脑），就是明显的“传文件整页卡”。

修复：把进度更新节流到 200–250 ms，或把进度放进独立的 store/组件，让只有进度条订阅。

### P1-8 文件内容 60 秒缓存且没有 ETag

`files.controller.ts:181`：`Cache-Control: private, max-age=60`；`getFileStream` 没有返回 ETag。生产 24h 的 `/files/:id/content` 是 **136 次、1.35 GB**，同一个 36 MB 文件被下了 5 次、19 MB 文件 4 次、7.5 MB 文件 5 次。很多是超过 60 秒后重新打开又整包重下，而且每次都要 Node 从 MinIO 拉流再转发。

文件 id + storageKey 是不可变内容，可以加 `ETag`（MinIO 的 etag）并把 `max-age` 提到 1 天；如果担心分享撤销，至少保留 `private` 并缩短到可接受的窗口。

### P1-9 QQ 桥接空轮询占了 75% 的请求

生产 24h：

```
GET  /integrations/qq-bridge/manifest    14,421 次
POST /integrations/qq-bridge/heartbeat   14,420 次
合计 ≈ 28,841 / 43,000 ≈ 67–75% 的全部 HTTP
```

而 `QqBridgeDelivery` 表里 **0 条投递**。manifest 每次 3–4 条 SQL（bindings、groups、uncertain deliveries）；heartbeat 虽然写入被 15 秒节流，连接器仍每 5–6 秒打一次。

服务端的 `claim()` 空轮询已经用只读 hint 修过了（`qq-bridge-delivery.service.ts:100-122`），**不要重复改**。真正的浪费在连接器侧的 5 秒轮询：15–30 秒一次，或改成 WebSocket/长轮询，可以直接砍掉 2/3 的请求和日志量；manifest 还可以加 `ETag`。

### P1-10 后台空转与其他

- **outbox worker 每 10 秒空转**：`outbox-worker.service.ts:37-45`，24h 约 8,640 次 `hasDueEvents`，99.4% 没有事件。`file-preview-worker` 和 `album-media-worker` 已经用了现成的 `IdlePollSchedule`，outbox 直接复用即可（有新事件时本来就有 `outboxWakeupService` 即时唤醒）。
- **presence 日志每次连接一次同步写**：`presence-coordinator.service.ts:25/48/75` → `presence-log.service.ts`，约 3,300 行/天，每行一次 fsync，和消息写入抢同一个 WAL 队列。可以批量缓冲，或像 heartbeat 一样对这类可重建的观测数据关同步提交（需要产品确认可接受断电丢失窗口）。
- **月度考勤报表按小时跑**：`attendance-monthly-report.scheduler.ts:15`，`0 5 * * * *` 是每小时一次，不是每月/每天；虽然命中“已存在”就返回，但调度明显写错了。
- **健康检查 4,767 次/天**：`health-readiness.service.ts:22-31` 每次 `SELECT 1` + MinIO `HeadBucket`，容器里没有 curl，靠 `node -e fetch` 每次新起一个 Node 进程。把 compose 的 `interval` 放到 30–60 秒，或改 TCP 探针。
- **`GET /presence-log` 的 `COUNT(*)`** 和 `AttendanceActionEvent` 缺 `occurredAt` 索引，目前一天几千行还能忍，属于增长债务。

### P1-11 一个消息事件重渲染整屏消息，memo 实际失效

`MessageItem` 确实包了 `memo`（`MessageItem.tsx:63`），但父级每次渲染都传新引用，浅比较必然失败：

- `MessagePane.tsx:212` 的 `jumpToMessage` 定义在组件体内，`:332` 下传；
- `MessagePane.tsx:330` 的 `onContextMenu={(item, position) => ...}` 内联箭头；
- `WorkspaceShell.tsx:492` 的 `artifactAction={{...}}` 对象字面量；
- `WorkspaceShell.tsx:508` 的 `canManageFileShare={() => ...}`；
- `WorkspaceShell.tsx:525` 的 `onReply={(messageId) => ...}`。

dev 实测（50 条消息频道，含 StrictMode 双跑，绝对数字约打对折）：

- 冷启动 3.9 秒内累计 **432 次 MessageItem 重渲染**；
- 向**另一个**群连发 5 条消息（当前频道内容完全没变）→ **5 次 commit、250 次 MessageItem 重渲染、188 ms script、199 ms task、0 个网络请求**；
- 向当前群发 5 条 → 12 次 commit、630 次 MessageItem 重渲染、296 ms script、310 ms task。

放大链路还不止 memo：`useRealtime.ts:233-241` 每条 `message.created` 都对 `['groups']`、`['dms']` 各做一次 `map`，`patchGroupList` 找不到该 group 也返回新数组，于是 WorkspaceShell 整棵树重渲染；`useWorkspaceShellModel.ts:626` 的 `notificationGroups={[...servers, ...dms]}` 每次渲染新建数组，又让 `useNotification.ts:79` 的 effect 每次重跑 O(群数)。`ChannelSidebar.tsx` 每次渲染全量重排序，比较器里还在 `new Date(...)`。

修复：把上述 5 个 props 用 `useCallback/useMemo` 稳定（`artifactAction` 要整体 memo）；`patchGroupList` 在该 group 不存在时返回原数组；`notificationGroups` 用 `useMemo`；侧栏排序和时间戳预计算。

### P1-12 窗口聚焦强制重拉群列表（忽略 staleTime）

`useNotification.ts:117-129` 在 focus/visibilitychange 时（1 秒节流）调 `refreshConversationList()` → `groupsQuery.refetch()`。`refetch()` 是强制网络请求，绕过 30 秒 `staleTime`；实测 alt-tab 回来就发一次 `GET /groups`（全部群 + 成员 + 最新消息，最大 203 KB）。改成 `invalidateQueries`（尊重 staleTime）或判断 `dataUpdatedAt` 超过 30 秒再拉即可。

---

## 四、P2：增长债务（现在不痛，曲线很陡）

| 问题 | 位置 | 说明 |
| --- | --- | --- |
| 缺失索引 `Message.externalAvatarFileId` | `prisma/schema.prisma:317` | 文件回收的 `attachmentFileId OR externalAvatarFileId` 因一侧无索引退化成全表扫描（3.07 ms → 0.12 ms） |
| 每条鉴权请求一次用户查询 | `auth/auth-user.service.ts:9-20` | 约 4 万次/天；可按 `(sub, authVersion)` 做 30 秒 LRU |
| Prisma 关系查询逐 relation 发 SQL | 全局 | 群列表 6 条、消息页 8–13 条；`relationJoins` 仍是 preview，建议先在 staging 对比，不要直接上生产 |
| `getVisibleConfig` 每次重读整张配置表 | `system-config.service.ts:33-34` | 26 行、1.8 KB，可像 `PermissionConfigService` 一样缓存 |
| 发消息事务里 QQ 桥接固定多 2 条查询 | `qq-bridge-delivery.service.ts:43-51` | 即使该群未绑定也会查 user + binding；可用内存集合快速判断 |
| `GET /groups` 列表带全量成员 | `group-presenter.service.ts:124-139` | 重用户 190 KB 中约 83 KB 是成员数组；侧栏只需要 `memberCount` + 当前用户角色 + 选中群成员 |
| 消息页回执按收件人展开 | `message-read-receipt.service.ts:57-102` | 大群下每页重复 50 份成员列表；前端只显示自己的消息回执，可只为当前用户构造 |
| 夜间任务挤在 03:00–04:40 | 多个 scheduler | 4 核 Celeron + 同盘 MinIO，80 分钟内集中跑 retention/cleanup/backup，错开更稳 |
| Postgres/MinIO 无内存上限 | `deploy/synology/docker-compose.yml` | 宿主只有 3.7 GB，MinIO 目前 472 MB；建议设上限，避免互抢 |
| `proxy_buffering off` 作用于所有 `/api/` | `nginx.conf.template:59` | 本意是大文件下载，却让所有 JSON 也不能被 nginx 缓冲；建议只对 content 路由关闭 |
| 活动日历 `pointermove` 重渲染整个日历 | `GroupActivityCalendar.tsx:175-176` | 实测 100 次 pointermove → 94 次 commit、301 ms script、427 ms task；tooltip 位置应走 ref + transform |
| 考勤“今日快照”永久 60 秒轮询 | `useOwnCheckInController.ts:42-46` + `live-query-policy.ts` | 每个标签页 120 次/小时，数据只在打卡/跨天时变化；仅在面板打开时轮询或降到 5 分钟 |
| 静音按钮一次点击 ≈ 6 个请求 | `GroupMuteButton.tsx:34` + `useRealtime.ts:312-316` | 本地已 patch 仍 invalidate 整包 bootstrap，且 `group.updated` 不区分 reason 全量失效；实测一次点击 5 个 GET，含 140 KB bootstrap |
| 任务列表没有 `staleTime` | `TaskSection.tsx:40-44` | 默认 0，切回同一频道 10 秒内也会重拉；与 artifacts/work-state 的 30 秒不一致 |
| 管理员 discovery `staleTime: 0` | `useWorkspaceShellModel.ts:171-177` | 跨 server 切频道每次重拉；该列表只在加入/归档时变化 |
| 读回执事件 O(消息数) 复制 | `useRealtime.ts:62-93` | 每个成员推进游标都重建整页消息对象；50 人群、每消息全员已读 ≈ 2,500 次对象重建 |
| 缩略图生成中每图 3 秒轮询 | `useAttachmentThumbnail.ts:51-83` | 当前数据全部 READY 未触发；批量上传 20 张、转码慢时约 6.7 请求/秒，且无总时长上限 |
| 登录/静默刷新多一次 `/users/me` | `useSession.ts:63/72/158` | `knownCurrentUser ?? await getCurrentUser()` 的调用方都没传已知用户，每次登录/刷新多一个 RTT |
| 考勤/订阅页仍逐个 new `Intl.DateTimeFormat` | `DmAttendancePage.tsx:27/37`、`DmSubscriptionPage.tsx:52` | 项目已有 `date-formatters.ts` 缓存但未复用；30 天视图每次渲染约 60 次构造（1–3 ms），低优先级 |

---

## 五、已经做对的，不要重复改

- 长列表虚拟化（>100 条启用 TanStack Virtual）、Composer 草稿的每实例 Zustand store、日期 formatter 按 locale 缓存。`MessageItem` 的 `memo` 也加了，但目前被 P1-11 的内联回调抵消，需要配合稳定 props 才能生效。
- QQ 桥接 `claim()` 的空轮询只读预检、heartbeat 15 秒去重 + `synchronous_commit=off`。
- 缩略图有 ETag + 1 小时缓存；静态资源有预压缩 `.gz` + immutable。
- `/groups`、`/messages`、`/tasks` 等大部分 GET 都有 ETag，生产里 1,236/1,450 次 `/groups` 是 304，这部分流量控制是对的。
- outbox/预览/相册 worker 的 `IdlePollSchedule`（outbox 还没接）、前端实时事件的去重与刷新队列。
- 数据库核心索引 `(groupId, eventSequence)`、`(groupId, createdAt)` 都存在，热读基本 0.1–4 ms，不是瓶颈。

启动与包体基线：已登录冷启动约 22 个 API 请求，扣除 dev StrictMode 双跑后约 16 个；**没有发现新的重复端点**，唯一的启动重复仍是 bootstrap 内的消息 + 直连 messages。现有 `dist` 首屏约 341 KB gzip（react-vendor 125 + WorkspaceShell 109 + main 42 + markdown 40 + routing 25），`milkdown-gfm` 只被文章编辑器动态 import，未进首屏；本次没有可落地的包体级问题，不需要为此改构建。

---

## 六、建议的验收方式

1. **头像**：固定一个账号，清空浏览器缓存后打开同一频道 3 次，统计 `/avatars/users/*` 的请求数与 nginx `body_bytes_sent`；目标从“每次几十次 / 几百 KB”降到“每张图一次 / <10 KB”。
2. **切频道**：同一账号在 5 个频道间来回切 10 次，统计 `/workspace/bootstrap` 与 `/messages` 请求数；目标每次切换只有 1 个消息请求，bootstrap 只在首次或失效时出现。
3. **传输**：`curl -H 'Accept-Encoding: gzip'` 请求 `/api/groups` 和 `/api/workspace/bootstrap`，确认有 `Content-Encoding: gzip`，对比压缩前后字节。
4. **写延迟**：从请求日志统计 `POST /messages`、`POST /uploads/:id/complete`、`PATCH /read-cursor` 的 p50/p95；软件侧目标是上传完成不再有 3 次以上串行提交，硬件侧目标是 fsync 从几百毫秒降到 20 ms 以内。
5. **上传卡顿**：限速上传 2 MB 文件，记录 React commit 数与主线程时间；进度节流后 commit 数应从 30+/3 秒降到 10 次左右。
6. **后台空转**：观察 `OutboxEvent` 的 `idx_scan`、`presence-log` 的写入次数、`GET /groups` 的 SQL 条数，确认相应指标下降。

---

## 七、一句话总结

这个软件现在的主要问题不是“算得慢”，而是“同样的事做了很多遍”：5 张头像被下载 500 多次、切一次频道把整个工作区和消息拉两遍、为了 95 行预览读 6,000 多条消息、上传进度每来一个网络事件就重绘整个页面；真正写库的操作则被 NAS 机械盘的 fsync 卡在 400–900 ms。先把头像缓存/压缩、bootstrap 拆分、群列表最新消息查询、API gzip 这四件事做掉，体感会立刻不一样；WAL 迁 SSD 是把“发消息仍然要等半秒”这最后一截也解决掉的关键。
