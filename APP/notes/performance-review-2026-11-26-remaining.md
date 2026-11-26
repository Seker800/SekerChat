# SekerChat 性能复核（v0.9.31 剩余热点）

- 前置报告：`APP/notes/performance-review-2026-11-26.md`（今日早先；含 P0/P1 修复落地记录）
- 本报告只列 **前置报告未覆盖、或已记录但仍未修** 的最慢路径；已修复项不重复计入
- 基线：`main` @ `c65e3ff`（含 19:25 并发落地的「减少消息链路与实时刷新的重复开销」），生产 `v0.9.31`
- 说明：复核期间仓库新增了该提交；其中已修的项统一列在第六节，不计入下面的排名
- 方式：只读。生产侧只执行 `docker ps/logs/stats`、只读 SQL 与 `EXPLAIN ANALYZE`；本机微基准跑真实导出函数；未改生产配置、未写生产库、未部署
- 结论口径：「最慢的 10%」= 按 **单次代价 × 触发频率** 排序后，当前真正占掉绝大部分等待/CPU 的代码路径

---

## 一、结论

前置报告修掉的是「重复请求 / 重复下载 / 重复渲染」那一层（头像、bootstrap 带消息、群列表最新消息、gzip、未读子查询、memo 失效、上传进度）。本次复核确认这些修复仍然生效，剩下的慢集中在另一层：

1. **出勤模块的日期计算**：`zonedDateParts` 每次调用都 `new Intl.DateTimeFormat`，又被按行、按天循环调用。这是当前后端最大的一笔纯 CPU 开销，且全部跑在 Node 单线程上。
2. **批量写作业把「逐条提交」当成免费**：`recomputeAllUsers` 在 HTTP 请求里跑 572 个 user-day 的逐条 upsert；在这块 RAID5 HDD 上，每一次提交都要等 WAL fsync，于是「一次配置修改」可以放大到分钟级。
3. **前端还剩两处高频重绘**：输入框每敲一个字强制同步重排；考勤热力图每次 `pointermove` 重渲染 365 个格子。
4. **每条消息仍有一串可省的固定工作**：QQ 投递判定、出勤打点、outbox 回表与广播序列化；其中 outbox 的领取/标记已改成异步提交、广播已去回执（`c65e3ff`），剩下的主要集中在 QQ 判定和出勤打点。写盘本身仍是硬件瓶颈，但这些是纯软件重复。

---

## 二、当前基线

### 2.1 数据量（生产只读核实）

| 表                               |                       行数 |
| -------------------------------- | -------------------------: |
| User / Group / GroupMember       |             17 / 123 / 328 |
| Message / 带附件消息             |              6,597 / 2,858 |
| FileObject / GroupArtifact       |                 2,866 / 40 |
| PresenceLog                      | 14,563（重用户一年 4,487） |
| AttendanceActionEvent / user-day |                2,996 / 572 |
| OutboxEvent                      |                      1,074 |
| QqBridgeBinding / Delivery       |                      1 / 0 |

### 2.2 请求样本（后端 `RequestLoggingInterceptor`，31 分钟 / 867 条）

| 端点                                      | 次数 |   p50 |   p95 |   max |
| ----------------------------------------- | ---: | ----: | ----: | ----: |
| `GET /integrations/qq-bridge/manifest`    |  317 |   5ms |  12ms |  17ms |
| `POST /integrations/qq-bridge/heartbeat`  |  317 |   1ms |   5ms |  13ms |
| `GET /groups/:id/files/:fileId/thumbnail` |   28 |  30ms |  49ms |  54ms |
| `GET /attendance/me/checkin/today`        |   23 |  15ms |  64ms | 246ms |
| `GET /groups`                             |    1 | 445ms |     — | 445ms |
| `GET /workspace/bootstrap`                |    2 |  90ms | 185ms | 185ms |
| `GET /groups/:id/messages`                |    8 |  35ms | 125ms | 125ms |
| `GET /groups/:id/messages/activity`       |    8 |  14ms | 170ms | 170ms |

### 2.3 本机微基准（Node 22 / Apple Silicon；J4125 预计再慢 1.5–2.5 倍）

| 被测代码                 | 规模                    |            中位耗时 |
| ------------------------ | ----------------------- | ------------------: |
| `zonedDateParts`         | 1,000 次                | 25.5ms（25.5µs/次） |
| `getLocalDayBoundaryUtc` | 365 次                  | 10.1ms（27.7µs/次） |
| `projectDailyPresence`   | 365 天 / 730 条日志     |              48.5ms |
| `projectDailyPresence`   | 365 天 / 4,487 条日志   |           156–180ms |
| `parseWorkDate` 等价循环 | 17 用户 × 4 段 × 365 天 |               714ms |

---

## 三、最慢的 10%（剩余项）

| #   | 代码路径                                                                                                                       | 触发频率                    | 单次代价                                                                     | 增长性                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| 1   | 出勤日期原语 + 三个按天/按行调用点（`zonedDateParts` / `projectDailyPresence` / `countMatchingWorkDaysInclusive`）             | 每次出勤页、每小时作业      | 管理页 ≈2s CPU；个人出勤页 ≈0.25s；`/attendance/daily` ≈0.42s                | 随日志行数、用户数、年份线性      |
| 2   | 改出勤配置时同步全量重算（`recomputeAllUsers`，压在 HTTP 请求里）                                                              | 管理员改时区/活动窗口       | 当前 572 个 user-day，约 570 次逐条 upsert 提交；HDD 上按 fsync 放大到分钟级 | O(用户 × 历史天数)                |
| 3   | `Composer` 每次按键 write→read→write 强制同步重排                                                                              | 每次按键                    | 1 次全文档布局 flush                                                         | 随 DOM 规模（历史消息、侧栏）增长 |
| 4   | 考勤热力图每次 `pointermove` 重渲染 365 格 + 每行新建 `Intl`                                                                   | 每次指针移动 / 每次页面渲染 | 5.15ms/次（365 格模型）；考勤页 8.9ms/渲染                                   | 固定格子数，随指针事件频率        |
| 5   | 消息发送/广播的重复工作（QQ 投递判定 + 出勤打点 + outbox 回表/广播序列化；提交已异步、广播已去回执）                           | 每条消息                    | 14–18 条 SQL；消息事务 1 次同步提交 + 出勤 1 次独立提交；2 次序列化          | 随消息量、绑定群数                |
| 6   | 保留/清理类批处理（presence-retention 每晚 100 user-day 上限、retention 单事务巨型 IN、purge 全表扫、upload-cleanup 逐条串行） | 每天 / 每小时               | 单夜上限 100 user-day；retention N 行单事务；清理最坏 1 万 session           | 随用户 × 历史天数、消息量线性     |
| 7   | 管理端产出列表逐项 `HeadObject`（N+1，且无分页）                                                                               | 每次打开管理页              | 40 次 S3 HEAD                                                                | 随产出总量线性                    |
| 8   | 群列表仍带全量成员（前一版报告的 P2 项仍未修）                                                                                 | 每次打开/刷新工作区         | `GET /groups` 445ms 样本；211KB，其中成员数组 93.8KB                         | 随群数 × 成员数                   |
| 9   | 缩略图/原图仍全部经 Node 回源（头像已修，但媒体代理未变）                                                                      | 每个图片请求                | 5 条 SQL + MinIO GET + 全量转发，avg 30ms                                    | 随图片数量线性                    |
| 10  | 启动/后台的固定浪费（启动月报逐用户逐月、DND 启动 4 次提交、geolite 同步解压、QQ 5 秒轮询）                                    | 每次启动 / 每 5 秒          | 月报 7 SQL/user-month；启动 4 次 fsync；QQ 占 73% 请求                       | 固定 / 随用户×月数                |

---

## 四、逐项分析

### 1）出勤模块：把 Intl 构造放进按天/按行循环

**位置**

- `APP/apps/backend/src/attendance/attendance.utils.ts:56-104`（`zonedDateParts`，每次 `new Intl.DateTimeFormat`）
- `APP/apps/backend/src/attendance/attendance.utils.ts:178-186`（`getLocalDayBoundaryUtc` 内部再调一次）
- `APP/apps/backend/src/attendance/attendance-projection.service.ts:37-115`（逐条日志分桶 + 逐天边界）
- `APP/apps/backend/src/attendance/attendance.service.ts:845-862`（`countMatchingWorkDaysInclusive` 按天 `parseWorkDate`）
- `APP/apps/backend/src/attendance/attendance.service.ts:478-538`（`listUserAttendanceAverages`，管理端出勤页）
- `APP/apps/backend/src/attendance/attendance.service.ts:356-462`（`getOwnCheckInPanel`，个人出勤页/默认落地页）
- `APP/apps/backend/src/attendance/attendance.service.ts:1037-1056`（`listPresenceWorkDates`，`/attendance/daily`）

**证据**

- `zonedDateParts` 本机 **25.5µs/次**，`getLocalDayBoundaryUtc` **27.7µs/次**，几乎全花在 formatter 构造 + `formatToParts` + `Object.fromEntries`。
- `projectDailyPresence` 对每条日志调一次 `zonedDateParts`，再对每天调 2 次 `getLocalDayBoundaryUtc` 和 1 次 `zonedDateParts(now)`。4,487 条日志的「重用户一年」= **156–180ms**；全库 14,563 条日志光分桶就约 **0.42s**。
- `countMatchingWorkDaysInclusive` 对「数据首日 → 今天」的每一天调 `parseWorkDate` → `zonedDateParts`；17 用户 × 4 段 × 365 天 = **714ms**（本机）。
- 合起来，`GET /attendance/users/averages`（管理端「出勤」页）约 **2s 单线程 CPU**；`GET /attendance/me/checkin/panel?days=365`（DM 出勤落地页）约 **0.25s**；`GET /attendance/daily` 约 **0.42s**（该端点 Web 端目前无调用方，属潜在雷）。
- 这些 CPU 不是一次 2s 的连续阻塞，而是几十到几百毫秒的碎块反复抢占事件循环；期间所有 HTTP/WS 请求都要排队。

**修复方向**

- 把 `Intl.DateTimeFormat` 按 `timeZone` 做模块级缓存（1 个 formatter 复用）；单这一项就能把 25µs 降到亚微秒。
- `countMatchingWorkDaysInclusive` 直接按 `Date.UTC` 算星期，不需要时区 formatter。
- `listPresenceWorkDates` 改成 SQL `DISTINCT`；`listUserAttendanceAverages` 改成一条聚合 SQL + 一次批量 `presenceDailySummary` 查询。

### 2）改出勤配置：同步全量重算，压在 HTTP 请求里

**位置**

- `APP/apps/backend/src/attendance/attendance.controller.ts:151-166`（`PATCH /attendance/config` 里 `await recomputeAllUsers()`）
- `APP/apps/backend/src/attendance/attendance.service.ts:576-586`（按用户串行）
- `APP/apps/backend/src/attendance/attendance.service.ts:625-668`（每个用户拉全部历史事件，再按天串行）
- `APP/apps/backend/src/attendance/attendance.service.ts:804-829`（每天 `loadDayEventDates` 一条查询 + `attendanceDaily.upsert` 一次自动提交）

**证据**

- 生产当前有 **572 个不同 user-day**（10 个有打点记录的用户）；每个 user-day 至少 1 条 `loadDayEventDates` 查询 + 1 条 `attendanceDaily.upsert`，约 **1,100+ 条串行语句**。
- `upsert` 是自动提交，每次提交等 WAL fsync；沿用前置报告的生产实测（fsync 中位约 0.5s），572 次提交就是 **分钟级**；即便 fsync 已降到 50ms，也是 **30 秒级**。
- 这段代码 `await` 在 HTTP 请求里：管理端保存配置会一直挂着，同时占用连接、占满单核和磁盘队列，其他用户的消息/心跳全部排队。
- 增长性：O(用户数 × 有打点的历史天数)。只要有人改一次时区就会触发。

**修复方向**

- 改成后台任务 + 进度查询，HTTP 只落配置并返回 202。
- 重算是可推导数据：单事务批量 upsert + `SET LOCAL synchronous_commit = off`，按日期分片、支持断点续跑。
- 每小时 `recomputeRecentDays` 的逐日 upsert 也合并成一次批量写。

### 3）Composer 每次按键强制同步重排

**位置**：`APP/apps/frontend-react/src/components/workspace/Composer.tsx:133-150`

```ts
useLayoutEffect(() => {
  textarea.style.height = '0px';          // 写 → 布局失效
  const contentHeight = textarea.scrollHeight; // 读 → 强制同步 flush
  textarea.style.height = `${...}px`;     // 再写
}, [text]);                                // 每个字符都跑
```

- 依赖 `[text]`，每敲一个字符执行一次；`useLayoutEffect` 在 paint 前运行，write→read→write 是典型的强制同步布局。
- 单次成本随文档 DOM 规模增长：历史消息、侧栏群/成员越多越贵。草稿已下沉、消息列表已虚拟化，但这一处仍把每次输入钉在布局路径上。
- jsdom 没有布局引擎，无法给本地 ms；这是代码级确定行为。

**修复方向**：优先 CSS `field-sizing: content`；退化方案是只在 `scrollHeight` 变化时写高度，且不要每键写 `height='0px'`。

### 4）考勤热力图：每次 `pointermove` 重渲染 365 格 + 每行新建 Intl

**位置**

- `APP/apps/frontend-react/src/components/workspace/DmAttendancePage.tsx:25-45`（`formatTimeLabel` / `getShanghaiTimeParts` 每次 `new Intl.DateTimeFormat`）
- `APP/apps/frontend-react/src/components/workspace/DmAttendancePage.tsx:86-88`（`rows` 没有 `useMemo`，每次渲染重算 30–90 行 × 2 次 Intl）
- `APP/apps/frontend-react/src/components/workspace/DmAttendancePage.tsx:257-284`（365 个格子；每格 2 次 `parseDateKey(getWeekStartDate(...))` + 1 次 `getWeekdayIndex`）
- `APP/apps/frontend-react/src/components/workspace/DmAttendancePage.tsx:268`（`onPointerMove` → `setTooltip` 新对象）

**证据**

- 365 格同结构模型：连续 60 次 `pointermove` → 60 次 commit，**5.15ms/次**；365 格派生单独测 p95 **8.87ms**。
- 考勤页每行标题 2 次 `Intl`：range=90 时 `rows` 派生 **4.50ms** + 标题 **4.36ms**，约 **8.9ms/次渲染**；项目已有 `utils/date-formatters.ts` 缓存，这一页没用。
- 每次移动无条件 `setState`（同像素抖动也重渲染），没有 rAF 合并或位置变化判断。
- jsdom 的 commit 比真实浏览器慢约 2–3 倍，但 `Intl` 构造次数和 365 格 × 3 次 Date 构造是真实的。

**修复方向**：全部改用 `dateFormatter()`；`rows` 加 `useMemo`；`column/row` 预计算；tooltip 用 ref + `transform` 或 rAF 合并 + 仅日期变化时 setState。

### 5）消息发送/广播的重复工作

> `c65e3ff` 已把 outbox 的领取/已处理标记改成 `synchronous_commit=off`，并让实时广播不再查询/携带全成员已读回执。下面只列这条链路上仍然剩下的部分。

**位置**

- `APP/apps/backend/src/messages/messages.service.ts:157-260`（事务：message / fileObject / group / groupMember / outbox / deliveryIntents）
- `APP/apps/backend/src/messages/message-delivery-intents.ts:29-35`
- `APP/apps/backend/src/extensions/qq-bridge/qq-bridge-delivery.service.ts:39-98`（每次发送先查 user + binding；命中绑定再 `activeBinding` 两把 `FOR UPDATE` + 两次 findUnique）
- `APP/apps/backend/src/messages/message-application.service.ts:18-60`（响应路径再查全部群成员 + 序列化）
- `APP/apps/backend/src/common/attendance-tracking.interceptor.ts:33-52` → `attendance-action-recorder.service.ts:84-116`（每条命中写操作再 `findFirst` + `create`，额外一次提交）
- `APP/apps/backend/src/outbox/user-message-created-outbox.handler.ts:19-58` + `message-application.service.ts`（worker 回表 + 第二次序列化）
- `APP/apps/backend/src/outbox/outbox.service.ts:30-79`（claim / markProcessed 仍是两个事务，但已关同步提交，不再等 fsync）

**证据**

- 无 QQ 绑定的群：事务内 5 条写 + `deliveryIntents` 无条件 2 条查询（user + binding）。
- 有绑定（生产 1 个）：`activeBinding` 再 2 条 `SELECT … FOR UPDATE` + 2 条 findUnique，并持有 connector/binding 行锁；同群并发发送在 connector 行锁上串行化。
- HTTP 响应路径仍要查全部群成员构造回执；outbox worker 又把消息和群成员各回表一次、再做一次无回执序列化（每条消息约 14 条后台语句，提交已异步）。
- 响应之后全局出勤拦截器再写一条 `AttendanceActionEvent`（15 秒去重，先查后写），这是一次独立 fsync 提交，和消息事务抢同一块盘。
- 写盘本身仍是前置报告说的 HDD fsync 瓶颈；这里列的是 **可以砍掉的软件重复**：QQ 判定、出勤打点、outbox 回表/广播序列化。

**修复方向**

- 事务里只写投递意图到 outbox，QQ 绑定判定交给 worker；不要在消息事务里 `FOR UPDATE`。
- 出勤打点合并进同一事务，或改 `INSERT … ON CONFLICT DO NOTHING`（user + method + path + 15s 桶）。
- outbox payload 存「已序列化消息 + 受众快照」，handler 不再回表、不再二次序列化。

### 6）保留/清理类批处理

> `c65e3ff` 已把相册图片的校验和/尺寸改成一次下载；保留/清理类任务本次未改。

**位置**

- `APP/apps/backend/src/attendance/presence-retention.service.ts:9`（`MAX_DAYS_PER_RUN = 100`）、`:34-100`（每轮 3 查询 + 1 事务）
- `APP/apps/backend/src/messages/retention.service.ts:119-145`（`findMany` 无 `take`）、`:219-240`（单事务 `updateMany where id in [...]`）
- `APP/apps/backend/src/messages/retention.service.ts:66-100`（`purgeOrphanedFiles` 全表 anti-join + 逐文件串行 `retire`）
- `APP/apps/backend/prisma/schema.prisma:305`（`externalAvatarFileId` 无索引）
- `APP/apps/backend/src/uploads/upload-cleanup.service.ts:23-93`（每批 100、最多 100 批，逐条 `abortMultipartUpload` + 2 SQL 串行）

**证据**

- `presence-retention` 每晚最多压 100 个 user-day；每人每天贡献 1 个，**用户数超过 100 后永久积压**，积压会反噬所有扫 `PresenceLog` 的端点。
- 按天保留策略一次性载入全部超期附件消息，再在单事务里 `where id in [...]` 更新；N 大时长事务 + 大 WAL 突发，超过 65,535 个绑定参数会直接报错。
- `purgeOrphanedFiles` 对 `Message`/`FileObject` 做 anti-join 全扫；`externalAvatarFileId` 没有索引（其他关联字段都有），命中后逐文件 `await retire()`（S3 delete）。
- `upload-cleanup` 最坏 1 万 session × 3 次串行网络操作；跑超 1 小时会因 cron 的 `waitForCompletion` 语义静默跳过整轮。

**修复方向**：presence 按天全员 `INSERT…SELECT` + `DELETE`；retention 按 500/批 + 断点；purge 补 `externalAvatarFileId` 索引并按群前缀 LIST；upload-cleanup 限并发（如 8）+ 集合化 abort。

### 7）管理端产出列表：每个产出一次 `HeadObject`

**位置**

- `APP/apps/backend/src/artifacts/artifacts.service.ts:77-88`（`listArtifactsForAdmin` 对每个产出 `checkArtifactExists`）
- `APP/apps/backend/src/artifacts/artifacts.service.ts:741-747` → `object-storage.gateway.ts:182-199`（HEAD）
- 对照：群内 `listArtifacts` 已用 `resolveFileExistence`（`:706-739`）一次前缀 LIST（`c65e3ff` 刚修）；管理端 `listArtifactsForAdmin` 仍是逐项 HEAD，没有复用

**证据**：生产 40 个产出 = **40 次 S3 HEAD**；管理端列表没有 `take`/分页（`artifact.repository.ts:26-51`），随产出总量线性增长。

**修复方向**：复用 `resolveFileExistence`，按群前缀一次 LIST；加分页。

### 8）群列表仍带全量成员

**位置**：`APP/apps/backend/src/groups/group-types.ts:3-48`（`groupWithMembersSelect` 带完整 `members`）；`group-query.service.ts:22-63`；`group-presenter.service.ts:124-139`

**证据**：用生产真实行回放，重用户（106 群 / 297 成员行）的群列表 JSON **211.5KB**，成员数组 **93.8KB**；`GET /groups` 445ms 样本（冷启动单样本，日常 p50 17ms）。前置报告已把它列为 P2「GET /groups 带全量成员」，仍未修；`c65e3ff` 只加了 250ms 在线快照，成员数组仍然全量返回。

**修复方向**：列表 DTO 只回 `memberCount` + 当前用户角色 + 选中群成员；侧栏不需要全量成员。

### 9）缩略图/原图仍全部经 Node 回源

**位置**

- `APP/apps/backend/src/files/files.controller.ts:137-191`（`/content`）、`:67-104`（`/thumbnail`）
- `APP/apps/backend/src/files/file-access.service.ts:22-45`、`file-record.types.ts:4-18`
- 生产 `S3_PUBLIC_ENDPOINT` 为空

**证据**：单个图片请求 = JWT `user.findUnique` + 成员校验 + `fileObject.findFirst`（含 `previewJob` 关系，多一次往返）+ MinIO `GetObject`，约 **5 条 SQL + 1 次对象存储**；缩略图 **avg 30ms / max 54ms**。最忙的群最近 100 条消息里有 **55 条带附件**。头像已由前置报告修成共享缓存 + 256px WebP，但缩略图/原图仍走 `/content`、`/thumbnail` 代理。

**修复方向**：把 `S3_PUBLIC_ENDPOINT` 指到外网可达入口，缩略图/头像/原图走签名直链；只有确需权限收口的原图才回源。

### 10）启动/后台的固定浪费

**位置**

- `APP/apps/backend/src/attendance/attendance-monthly-report.service.ts:71-127`（每 user-month 约 7 条 SQL、253 次 formatter，两层串行）
- `APP/apps/backend/src/attendance/attendance-monthly-report.scheduler.ts:11-21`（启动 `void` 起跑；cron 已在 `c65e3ff` 改成每天 05:05，但启动任务与 cron 仍无互斥）
- `APP/apps/backend/src/main.ts:73` → `system-config/dnd-config.service.ts:32-41`（启动无条件 upsert 4 个 DND 默认值，值没变也写）
- `APP/apps/backend/src/network/network-status.ts:17-19`（首个 `/network/status` 请求内同步 `readFileSync + gunzipSync`，实测 9.6ms）
- `APP/apps/backend/src/extensions/qq-bridge/qq-bridge-connector.controller.ts:44-80`（manifest 每 5 秒 3 条 SQL；本次样本仍占 73% 请求）

**证据/说明**

- 月报在关账后首次重启时对每个用户逐月生成；存量齐全时只花 2 条查询，属于「低频但会抢启动后 CPU/DB」。
- DND 默认值启动时 4 次提交（每次一个事务），在 HDD 上会拖慢 `listen` 前的启动。
- geolite 首次请求同步解压 2.09MB→3.25MB，之后缓存。
- QQ 5 秒轮询是前置报告已记录项（P1-9），目前仍未改连接器轮询间隔；本次只更新了占比数字。
- outbox 空转已由 `c65e3ff` 接上 `IdlePollSchedule`；健康检查已从 15s 放长到 30s 并加 `--max-old-space-size=768`，不再列为本项。

**修复方向**：月报改成事件驱动 + 单事务批量；DND 先 diff 再写或合并单条 upsert；geolite 启动预热；QQ 轮询放长到 15–30 秒或改长轮询，manifest 加 ETag。

---

## 五、第二梯队（已知项，不再展开）

- **每条消息的 UI 扇出**：`useRealtime.ts:237-245`（每条消息 map 两遍 groups/dms）、`:339-352`（在线状态对所有群新建对象）；`ChannelSidebar.tsx:164-182`（排序里 `new Date`）；`RightSidebar.tsx:267`（每条消息重建全部成员行，组件无 memo，窄屏隐藏仍挂载）。`c65e3ff` 已把已读游标合并到 2.5s、活动日历刷新合并到 30s，这两条不再按每条消息触发；剩下的群数组/侧栏/右栏重建仍未完全修。
- **每请求固定成本**：JWT `user.findUnique`（`auth-user.service.ts:10-23`）+ 媒体鉴权再查一次 role + 请求日志 2 行；单次很小，但 3 万+ 请求/天。
- **打卡 60 秒轮询**：`useOwnCheckInController.ts:39-46`，每标签页 60 次/小时；数据只在打卡/跨天变化。
- **管理端存储统计**：`system-config.service.ts:93-173` 多次全表聚合 + 子查询，数据量上来后是秒级。
- **上传完成仍多次提交**：前置报告 P0-4 已记录（3 次 fsync）；相册图片的重复下载已由 `c65e3ff` 修掉，但状态提交次数未变。
- **缩略图 3 秒轮询**：`useAttachmentThumbnail.ts:73-78` 每图一个定时器，无总时长上限。
- **活动日历/群活跃度**：轮询已去掉，刷新已合并到 30s；但每次刷新仍全群扫描（`messages.service.ts:129-155`）。
- **presence 日志 fsync**：每次连接/断开一次同步写；前置报告 P1-10 已记录。
- **系统配置无缓存**：前置报告 P2 已记录。

---

## 六、确认不是问题

- **索引/查询计划**：`Message(groupId, eventSequence)`、`Message(groupId, createdAt)`、`GroupMember(groupId,userId)`、`OutboxEvent(status, availableAt)` 都命中；核心查询 1–6ms。
- **消息时间线算法**：`mergeItems` 5,000 条 0.26–0.44ms；`classifyMessageListMutation` 5,000 条 0.027ms；前端纯 JS 不是瓶颈。
- **前置报告已修且复核仍生效**：头像共享缓存/缩放、bootstrap 不带消息、最新消息 LATERAL、未读子查询、gzip、memo/回调稳定化、上传进度 200ms 合并、文件内容 ETag/5 分钟缓存、活动日历去轮询。
- **`c65e3ff` 刚落地的修复（已复核当前代码）**：outbox 领取/标记改异步提交 + 空闲退避；实时广播不再带全成员回执；群内产出列表一次前缀 LIST；相册图片校验和/尺寸一次下载；月报 cron 改每天 05:05；消息日期分组改为比较 day key（不再逐条建 formatter）；已读游标 2.5s 合并；活动日历 30s 合并刷新；健康检查 30s + Node 堆上限；群列表在线快照 250ms。
- **虚拟列表、草稿下沉、QQ 空 claim、heartbeat 15 秒去重**：都已生效，不要重复改。

---

## 七、局限

- 生产请求样本只有 31 分钟、低流量时段（867 条），`POST /messages` 没有样本；写路径耗时引用前置报告的 24h 基线。
- 没有在生产 NAS 上跑 profiler；CPU 数字是本机微基准，J4125 预计再慢 1.5–2.5 倍。
- 复核期间仓库仍可能有并发改动；本报告结论以 `c65e3ff` 为准，改动落地后应按第六节重新对照。
- jsdom 没有布局引擎，第 3 条的「强制重排」是代码级确定行为，没有本地 ms；第 4 条的 commit 时间在真实浏览器里会低一些。
- 第 1 条的管理端 2s 是「14,563 条日志 + 17 用户」外推值；原语成本是实测的。
- 第 2 条的分钟级是按前置报告 fsync 中位 0.5s 外推；如果当前 fsync 已改善，耗时会同比例下降，但「同步全量重算」的结构问题不变。

---

## 八、一句话总结

**前置报告修掉了「重复请求/重复下载/重复渲染」，`c65e3ff` 又修掉了 outbox 提交、广播回执、产出列表和相册重复下载这一层；现在剩下的是「出勤日期计算把单核算力烧光」「配置重算逐条等 fsync」「输入框和热力图把布局/渲染钉在高频路径上」，以及 QQ 投递判定、出勤打点和保留/清理任务的分批问题。** 先做出勤 Intl 缓存 + 配置重算异步化 + Composer 去重排这三件事，收益最大；数据库和消息查询本身仍然不慢。
