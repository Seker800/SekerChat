# SekerChat 性能问题修改建议（2026-11-26）

- 依据：`performance-review-2026-11-26.md`（已修复项）与 `performance-review-2026-11-26-remaining.md`（剩余项）
- 原则：优先复用现有抽象（`dateFormatter`、`IdlePollSchedule`、`resolveFileExistence`、`WorkQueueSignals`、`ReadCursorCoordinator`）；不改无关行为；先加可观测性再改算法；涉及 API/数据的改动保留兼容窗口
- 本文是设计建议，不代表已经全部实施；QQ 桥接的停用已经单独落地（见第一节）

---

## 一、QQ 桥接：停用（已完成，含边界说明）

**目标**：暂时不用 QQ 同步，停掉每 5 秒的 manifest/heartbeat 轮询，以及每条消息里的桥接查询。

**已做**

- 本机指向生产的 `seker-qq-bridge-qq-bridge-1` 容器已停止；停止后生产 `manifest`/`heartbeat` 请求归零（实测 60 秒窗口 0 条）。
- 新增服务端开关 `QQ_BRIDGE_ENABLED`，默认 `false`：
  - `/api/integrations/qq-bridge` 在 Express 入口直接返回 `410 QQ_BRIDGE_DISABLED`，不进入鉴权、全局拦截器和数据库；
  - `QqBridgeDeliveryService` 在开关关闭时不注册消息投递处理器，发消息不再有 `user`/`binding` 查询；
  - `QqBridgeGuard` 再做一层 410 防御，覆盖非中间件入口；
  - 管理接口 `/api/extensions/qq-bridge` 保留，仍可查看/整理连接器、绑定和积压。
- 新增回归：开关关闭时不鉴权、不注册投递；开关打开时保留原认证路径。

**边界**

- 外部连接器不在本仓库（同级 `SekerMaiBot/qq_bridge`）。服务端开关不能替它改轮询周期；如果它被重新启动，仍会按原间隔打 `410`，只是不再进入业务逻辑。要彻底停掉网络请求，需要停止该连接器或把它的间隔调大。
- 不删除既有连接器、绑定、消息与投递记录；恢复时把 `QQ_BRIDGE_ENABLED` 设为 `true` 并重启后端，再启动连接器即可。
- 生产要等这次后端镜像部署后才具备 410 快路径；在那之前，停掉连接器是唯一能立即消除轮询的手段。

**验证**

- `GET /api/integrations/qq-bridge/manifest` 在关闭时返回 410，且 `user`/连接器查询计数为 0。
- 发消息时 `QqBridgeDelivery` 不新增行；原有消息、绑定、管理页不受影响。
- 恢复开关后，原认证、manifest、claim 行为与回归测试一致。

---

## 二、出勤日期计算：把 Intl 从循环里拿出来

**现状与目标**：`zonedDateParts` 每次调用构造一个 `Intl.DateTimeFormat`（约 25µs），却被按日志行、按天、按用户循环调用。目标是把「格式化器构造」变成一次性的，把「按天算星期」变成纯 UTC 算术，而不是靠缓存所有结果掩盖复杂度。

**建议改法**

- 在 `attendance/` 增加一个模块级 formatter 缓存：`Map<timeZone, Intl.DateTimeFormat>`，只缓存固定选项（`en-CA`、年月日时分秒、weekday）。`zonedDateParts` 只读缓存，不再 `new`。
- `countMatchingWorkDaysInclusive` / `parseWorkDate` 的「星期几」不需要时区格式化：`workDate` 是本地日历日，直接 `new Date(Date.UTC(y, m - 1, d)).getUTCDay()`；保留节假日 override 的判定顺序不变。
- `listPresenceWorkDates` 改为 SQL 去重：按配置时区把 `createdAt` 转成日期后 `SELECT DISTINCT`，只回日期，不回 1.4 万行时间戳；`PresenceDailySummary` 已有的日期直接合并。
- `listUserAttendanceAverages` / `listUserStats`：不要按用户各跑一遍「全年原始日志 + 全年逐日投影」。优先用已结算的 `PresenceDailySummary`；缺失的日期再按用户批量取原始日志。查询用 `userId IN (...)` 分批，投影在内存按用户分组。
- 给 `projectDailyPresence` 增加一个「只算需要的日期」的入口（比如按 `startDate/endDate` 过滤日志），避免为了 30 天视图投影 365 天。

**边界**

- 输出字段、时区语义、节假日/调休 override、跨天 active window 全部保持；只替换「怎么算」，不替换「算给谁」。
- 保留 `zonedDateParts` 作为对外语义入口；不要在业务层散落 UTC 假设。
- 回滚是纯内部改动，无数据迁移。

**验证**

- 现有 attendance 单测全过；新增「formatter 构造次数」测试（类似前端 formatter 缓存的做法）。
- 对同一组日志，新旧投影结果逐日比对（含 DST 切换日、月初/月末、跨天 active window）。
- 生产只读对拍：同一用户同一年，`/attendance/me/checkin/panel` 的响应 JSON 逐字段一致。

---

## 三、改配置触发全量重算：从请求里移走，按批写

**现状与目标**：`PATCH /attendance/config` 同步 `await recomputeAllUsers()`，572 个 user-day 逐条 upsert；每个 upsert 一次自动提交，在 HDD 上被 fsync 放大到分钟级。目标是配置保存立即返回，重算变成可观察、可重试、可并发的后台任务。

**建议改法**

- 新增一个「重算任务」行（或复用 outbox/工作队列），`PATCH` 只落配置 + 入队，返回 202 和任务 id；管理页轮询任务状态。
- 重算器用单飞锁（Postgres advisory lock 或任务行 `FOR UPDATE`），同一时间只跑一个；失败可重试。
- 计算与写入分离：先在内存算出目标行，再按 500 行左右分块，单事务批量 upsert；`AttendanceDaily` 是可推导数据，分块事务用 `SET LOCAL synchronous_commit = off`，崩溃后整批重跑。
- 删除陈旧日期用一次 `deleteMany`（或按块），不要逐日。
- `recomputeRecentDays`（每小时）同样批量写，不要把逐日 upsert 留在循环里。

**边界**

- 配置保存的语义不变；重算完成前，旧投影仍然可读，管理页显示「重算中」。
- 不删除原始 `AttendanceActionEvent`；只重写派生表。
- 需要一次迁移加任务/锁表（如果不用 advisory lock），迁移与代码分开上线。

**验证**

- 同一份事件数据，批量重算结果与旧逐日算法逐行一致。
- 并发触发两次，只产生一个运行中的任务；失败后重试收敛。
- 断点续跑：中途杀进程，重跑后行数/值与全量重算一致。

---

## 四、Composer：去掉每键的强制同步布局

**现状与目标**：`useLayoutEffect([text])` 每敲一个字符执行 `height='0px'` → 读 `scrollHeight` → 写高度，触发一次强制同步布局。目标是让高度自适应回到浏览器排版，而不是每键测量。

**建议改法**

- 首选 CSS `field-sizing: content` + `max-height: 180px` + `overflow-y: auto`；支持时完全删掉 JS 测量 effect。
- 不支持时保留一个降级：只在 `scrollHeight` 与当前高度不同才写，且不要在每次输入都先置 0；`resize` 监听只处理容器宽度变化。
- 把「最大高度/滚动」作为 CSS 变量，避免 JS 与样式两处维护同一个 180。

**边界**

- 不改受控值/draft store、Enter 发送、Shift+Enter 换行、IME composition、粘贴和移动端键盘行为。
- `field-sizing` 是渐进增强，不支持的浏览器走降级路径，不阻断输入。

**验证**

- Playwright：输入长文本、粘贴多行、IME 组合、移动端视口，确认高度/滚动/发送行为一致。
- 性能：连续输入 5 秒，Layout 次数应显著下降（DevTools Performance 或 Playwright tracing）。

---

## 五、考勤热力图：预计算格子，tooltip 不再 setState 每帧

**现状与目标**：365 个格子每次 `pointermove` 都重渲染；每格渲染时做 2–3 次 `parseDateKey`，每行标题新建 2 个 `Intl`。目标是「数据不变就不重算格子，指针移动只动 tooltip」。

**建议改法**

- 用 `useMemo` 按 `statusSeries` 预计算每个格子的 `{ key, column, row, level, ariaLabel }`；列/行用 UTC 日期算术一次算好。
- 所有时间格式化改用 `utils/date-formatters.ts` 的 `dateFormatter`；`formatTimeLabel`/`getShanghaiTimeParts` 不再每次 `new`。
- tooltip 位置放 ref，`pointermove` 里用 rAF 合并后直接写 `style.transform`；只有 `day.workDate` 变化时才 `setState` 更新内容。或者只在 `pointerenter`/`focus` 切换格子时更新。
- 格子组件用 `memo`，props 只传预计算值和是否 active。

**边界**

- 保留键盘 focus、`aria-describedby`、tooltip 文本、移动端 touch/长按行为；不改统计数据。
- 不引入图表库；现有 DOM/CSS 网格继续用。

**验证**

- 现有考勤页测试；新增 Profiler 测试：连续 60 次 `pointermove` 的 commit 次数应接近 0（只有 tooltip 内容变化时 1 次）。
- 视觉回归：tooltip 位置、边界翻转（靠近视口右侧/底部）不变。

---

## 六、消息发送/广播：把「必须同步」的工作压到最小

**现状与目标**：每条消息除了消息行本身，还在事务里做 QQ 绑定查询/行锁、出勤打点、outbox 回表和第二次序列化。目标是事务只写「消息 + 投递意图」，其他都能异步或合并。

**建议改法**

- QQ 投递：消息事务只写一条轻量投递意图（或 outbox 事件），不查 `user`/`binding`、不 `FOR UPDATE`；由 worker 解析绑定、创建 `QqBridgeDelivery`。桥接关闭时连意图都不写。
- 出勤打点：把 `findFirst + create` 改成一条幂等写。用 `(userId, requestMethod, requestPath, bucket)` 唯一键 + `INSERT ... ON CONFLICT DO NOTHING`；`bucket = floor(epoch / 15s)`，需要一次迁移和回填。打点仍在响应后执行，不阻塞发送。
- outbox：payload 里直接带「无回执的序列化消息」，handler 不再回表 `Message`/`Group`、不再二次序列化；受众在派发时解析，避免成员快照泄漏给已移除成员。只有存在 bot/mention 处理器时才解析成员。
- HTTP 响应的回执仍按当前用户构造；不要为了省一次查询把回执广播给所有人。

**边界**

- 至少一次投递、`clientMessageId` 幂等、编辑/撤回语义、QQ 回声去重、已读回执只给发送者，全部保持。
- 出勤 15 秒窗口的语义不变；迁移期间允许重复行由唯一键兜底。
- outbox payload 变更是内部格式，不对外暴露；旧事件要有兼容读取或一次性清空（当前生产 outbox 只有 1,074 行，可安全处理）。

**验证**

- Prisma query 计数：发一条普通消息的 SQL 条数从 14–18 降到个位数；有/无 QQ 绑定两种路径分别断言。
- 并发发送 + 幂等重试；编辑/撤回/回声去重的既有测试。
- 出勤打点：同一 15 秒窗口只一行；跨窗口两行。

---

## 七、保留/清理任务：按批、按天、可重入

**现状与目标**：presence-retention 每晚 100 user-day 上限、retention 单事务巨型 `IN`、purge 全表 anti-join、upload-cleanup 逐条串行。目标是让清理任务的时间/内存与「数据量」线性，而不是一次吃完。

**建议改法**

- presence-retention：按「天」而不是「user-day」处理。先取最老的、已超过保留期的日期；对这一天所有用户批量算 projection（窗口函数或一次分组查询），`INSERT ... ON CONFLICT` 写 summary，再按天删原始日志。去掉 100 的硬上限，改成「每轮时间预算 + 游标」。
- retention：用 `createdAt`/`id` 游标分批（如 500–1000 条/批），每批一个事务；`in` 参数永远不超过批大小。首次收紧保留期时给一个上限和进度日志。
- purge：补 `Message(externalAvatarFileId)` 索引；用 `NOT EXISTS` + 索引判断引用，不要全表 anti-join。对象删除用 S3 `DeleteObjects`（单次最多 1000 个 key），DB 行按批删；保留现有宽限期。
- upload-cleanup：受限并发（如 8）处理 session；用 run lease/`IdlePollSchedule` 保证不重叠；跑超预算时记录「下轮继续」，不要依赖 cron 静默丢 tick。

**边界**

- 保留策略的截止时间、宽限期、不确定任务（uncertain/started）的处理规则不变。
- 所有删除操作幂等；部分失败保留引用，下一轮重试。
- 索引迁移用 `CREATE INDEX CONCURRENTLY`，与代码分开上线。

**验证**

- 小批量 fixture + 大于 65,535 的模拟 id 列表，确认分批后不再触发参数上限。
- 中断/重跑：任意一批失败后继续，不重复删除、不跳过。
- 清理前后 `PresenceLog`/`FileObject` 行数与保留策略一致。

---

## 八、管理端产出列表：一次 LIST，取消逐项 HEAD

**现状与目标**：`listArtifactsForAdmin` 对每个产出 `HeadObject`，40 个产出就是 40 次 S3 RTT，且没有分页。群内列表已经用 `resolveFileExistence` 一次前缀 LIST，管理端应复用。

**建议改法**

- 管理端结果按 `groupId` 分组；每组一次 `listKeys('artifacts/<groupId>/')`，在内存判断存在性；LIST 失败时再退回逐项 HEAD（保留现有容错语义）。
- 给管理端列表加 `take/skip`（或 cursor）和 `total`；默认页大小与群内列表一致。
- 把 `resolveFileExistence` 的入参从「同一群」放宽到「多群、按群分组」，避免复制逻辑。

**边界**

- 返回字段和 `fileExists` 语义不变；单群失败只影响该群，不把健康文件标成缺失。
- 管理端权限、筛选条件（群、上传者、工作状态、打包状态、搜索）保持不变。

**验证**

- 多群 fixture：S3 List 次数 = 群数，而不是产出数；LIST 失败时退回 HEAD。
- 分页边界、总数、筛选组合的现有测试。

---

## 九、群列表全量成员：摘要与详情分离

**现状与目标**：`GET /groups` 为每个群返回完整 `members`，重用户 211KB、成员数组 93.8KB；侧栏只需要成员数、当前用户角色和选中群成员。目标是列表只回摘要，详情仍由 `GET /groups/:id` 提供。

**建议改法**

- 后端新增 `GroupSummary`：`memberCount`、`currentUserRole`、`notificationsMuted`、`isMember`、DM 对方摘要（`dmPartner`）；列表查询去掉 `members`，用 `_count` + 当前用户的一条 membership。
- 保留 `GET /groups/:id` / `GET /dm/:id` 的完整成员；前端选中群后照旧拉详情，提及、右侧栏、回执都从详情取。
- 前端 `GroupResponse` 做兼容：`members` 可选，列表消费者改用 `memberCount`；presence 事件只 patch 选中群的成员 + 列表里的 `onlineCount`（如果需要）。
- 分两步上线：先加字段/接口并让前端优先用摘要，观察一个版本后再移除列表里的 `members`，避免老客户端/缓存直接坏掉。

**边界**

- DM 名称、presence、未读、通知静音、当前用户角色、归档/隐藏语义全部保持。
- 列表不再承载成员，不等于成员接口下线；`GET /groups/:id` 仍是唯一权威。
- OpenAPI 与 contracts 同步更新；旧字段保留一个兼容窗口。

**验证**

- 侧栏成员数、在线点、DM 名称、提及候选、右侧栏成员列表、回执的现有 e2e。
- 重用户 106 群的响应体大小对比；列表 SQL 不再 join 全量成员。
- 旧字段兼容测试：只有摘要时页面不崩。

---

## 十、媒体代理：能直连的走直连，必须代理的保持代理

**现状与目标**：缩略图/原图仍经 Node 从 MinIO 拉流再转发，每个请求 5 条 SQL + 一次对象存储；生产 `S3_PUBLIC_ENDPOINT` 为空。目标是让公开可缓存的缩略图/头像/原图走签名直链，把 Node 留给需要权限收口或不能直连的场景。

**建议改法**

- 配置 `S3_PUBLIC_ENDPOINT` 为外网可达的 HTTPS MinIO（或独立只读域名）；给 bucket 配 CORS（GET/HEAD，允许前端 origin）。
- `FileUrlService` 为缩略图/原图生成短 TTL（5–15 分钟）的 presigned URL；前端 `<img>` 直接用，不再带 Authorization fetch。
- 保留 `/files/:id/content` 作为兜底：`S3_PUBLIC_ENDPOINT` 为空、文件分享/公开分享需要按 token 校验、或浏览器直连失败时使用。
- 头像已经是不可变长缓存，可继续走当前路径；不要为了统一而把头像改回代理。

**边界**

- 签名 URL 是 bearer 语义，TTL 内可被转发；按文件/短 TTL 控制，不要生成长效 URL。
- 文件撤销/分享撤销的窗口 = TTL；需要立即撤销的下载仍走代理。
- 不暴露 storageKey；CSP 的 `img-src`/`connect-src` 同步加入公开 origin。
- 回滚：清空 `S3_PUBLIC_ENDPOINT` 即回到全代理。

**验证**

- 无 cookie/Authorization 的 `<img>` 能加载；URL 过期后 403；撤销分享后代理路径立即拒绝。
- 缩略图缓存命中率、Node 出流量、图片请求 p95 对比。
- 断网/直连失败时前端回退代理。

---

## 十一、启动与后台：把「每次启动都写」改成「只在变化时写」

**现状与目标**：月报在启动/每日逐用户逐月串行；DND 默认值启动时 4 次无条件 upsert；geolite 首次请求同步解压。目标是启动路径不产生无意义写，后台任务可重入、可观察。

**建议改法**

- 月报：用单飞锁 + 任务行；先查缺失月份，再按用户批量生成；已存在就跳过。cron 与启动任务共用同一把锁，避免重叠。
- DND：先读现有配置，只对缺失 key 做一次批量 `INSERT ... ON CONFLICT DO NOTHING`；不要 `for` 循环 4 次 upsert。启动时值没变就不写。
- geolite：在 bootstrap 阶段异步预热（`await` 放在 `listen` 之后或独立 warmup），或首次请求用异步 `gunzip`，不要 `readFileSync + gunzipSync` 阻塞事件循环。
- outbox/预览/相册 worker：统一用 `IdlePollSchedule`（outbox 已接），空闲退避到 60s，有 wakeup 立即唤醒。

**边界**

- 启动仍要保证 DND 默认值可用；月报仍要在关账后生成；geolite 仍要在第一次查询前可用。
- 不改变 cron 的业务时间语义（月报每天 05:05，保留现有）。
- 启动任务失败不阻塞 `listen`，但要有日志/重试。

**验证**

- 冷启动时 `SystemConfig` 无变化则 0 次写；缺 key 时一次批量写。
- 月报并发触发只跑一个；关账后首次启动生成齐全。
- geolite 首次 `/network/status` 的 p95 不再包含 9.6ms 同步解压。

---

## 十二、不建议的做法

- 不要用「全局 cache 一切」掩盖按天/按行循环；先把 formatter 和查询形状改对，再加缓存。
- 不要为了省一次查询把成员/回执广播给所有人；权限边界比几毫秒重要。
- 不要在没有度量口径的情况下改虚拟列表/消息合并；它们已经不是瓶颈。
- 不要直接删列表里的 `members` 字段；先加摘要字段并让前端迁移，保留一个兼容窗口。
- 不要把保留/清理任务的失败吞掉；清理必须可重入、可观察。
