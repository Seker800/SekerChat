# 下载诊断日志

每次实际内容传输保留摘要，按需手动检查，不创建定期检查任务、不向成员展示其他人的活动。
日志属于尽力而为的诊断数据，不作为访问审计、计费或网络责任认定依据。

## 记录范围与指标

- 服务端观察群组文件、产出、文章附件、相册原图/视频和公开分享的 `GET .../content`：开始、完成、失败、连接中断。Range 请求每次单独记录，并标记 `partial`；缩略图、元数据与 HEAD 请求不计入。
- Web 原图预览额外记录浏览器实际收到的字节：开始、每 15 秒进度、最终完成/失败/取消。共用的下载只记录一次，内存缓存命中不创建新的传输记录。浏览器 HTTP 缓存可识别时标记 `browser_cache`，否则标记 `unknown`，不能把未知样本确定地当作网络吞吐。
- 原生浏览器“保存文件”保持流式下载，Cookie 会话通过同源内容接口，日志仅有服务端观测值。保留原来的 download-url 鉴权请求及文章下载计数。显式 Bearer 客户端仍兼容预签名直连；直连 MinIO 的传输、外部图片和原生浏览器自己的接收进度不在本日志可观测范围内。
- 字段包含关联编号、服务端认证得到的用户 ID（公开分享可能为空）、资源类型与 ID、UTC 时间、字节数、预期字节数、耗时、首字节等待、最长无新增字节间隔、结果与固定错误分类。客户端汇总通过关联编号和用户 ID 对应服务端记录，标记 `client_reported`，内容仍视为不可信输入。
- 平均传输速度为 `字节数 × 1000 / (总耗时毫秒 - 首字节等待毫秒)`，单位 B/s；无有效传输时间或已识别浏览器缓存时不计算客户端网络速度。保留原始字节与耗时便于重新计算。小文件和极短下载不能用来比较带宽。
- 服务端字节数表示对象流交给 HTTP 输出管道的字节，不等于浏览器已经收到；代理缓冲会造成明显差异。服务端 `completed` 表示 HTTP 响应写出结束，不证明用户保存到磁盘。需要优先结合客户端观测排查。
- 页面强制关闭、离线、程序崩溃或记录丢失时，可能只有 started/progress。汇总显示 `result_unknown`，不能视为完成或确定失败。

日志不包含文件名、内容、完整 URL、预签名参数、IP、Cookie、访问令牌、邮箱或任意客户端错误文本。
公开分享只记录 shareId 的 SHA-256 摘要，不能从日志直接还原分享链接。
客户端接口只允许已认证用户提交自己的有限数值/枚举字段，限制请求频率，不提供成员读取日志的接口。

## 保存与边界

本机默认目录是 backend 工作目录下 `.local/download-logs/`，已忽略；可用 `DOWNLOAD_LOG_DIR` 指定。
Synology Compose 将 backend 的 `/var/log/sekerchat/downloads` 挂载到部署目录的
`monitoring/downloads/`，应用替换不删除日志。部署配置的本地修改不代表已经启用生产记录。

按 UTC 日期生成 `downloads-YYYY-MM-DD.jsonl`，保留当天及之前 29 天。启动、跨日写入及每日 UTC 00:15
清理过期文件，只清理匹配该文件名前缀的日志。默认目录权限 0700、新文件 0600；生产宿主目录由运维限制访问。

当前仅支持单个 backend 进程写入。每日日志最大 20 MiB，30 天约 600 MiB；待写队列最多 256 条。
存储不可用或超过容量时丢弃诊断记录，在应用日志输出 `download_log_records_dropped`（最多每分钟一次），不影响文件传输。
这意味着“所有下载都尝试记录”，而非保证永不丢失；汇总不能假定日志完整。故障期间先排查该警告。

## 手动检查

在本机 `APP/` 执行：

```sh
node scripts/analyze-download-logs.mjs apps/backend/.local/download-logs/downloads-*.jsonl
node scripts/analyze-download-logs.mjs apps/backend/.local/download-logs/downloads-*.jsonl --user USER_ID --since 2026-10-31T00:00:00Z
```

输出 JSON，分别汇总服务端与客户端结果、缓存样本数、平均速度的中位数，以及最慢的 20 条完成记录。
同一用户/关联编号的两类观测不重复计算传输次数。尾部不完整或损坏行会计数；未知结果明确保留。
可按关联编号在原始 JSONL 查询完整记录，查看停顿和中间进度。

生产启用后，从 NAS 只读导出到本机忽略目录再检查（不需要生产数据库或对象存储凭据）：

```sh
mkdir -p .local/download-diagnostics
ssh nas 'tar -C /volume1/docker/sekerchat/monitoring/downloads -czf - .' > .local/download-diagnostics/logs.tar.gz
tar -xzf .local/download-diagnostics/logs.tar.gz -C .local/download-diagnostics
node scripts/analyze-download-logs.mjs .local/download-diagnostics/downloads-*.jsonl
```

先确认是否只有某个用户慢、是否有长时间停顿、同时间其他外网用户是否也慢，再对照当时的服务器/路由器监控。
本功能没有自动收集路由器公网带宽、区分内外网或判断瓶颈归属；下载记录本身不能证明 NAS 网络或用户网络哪一方有问题。

## 本地验证（2026-10-31）

- 前端全量 432 项通过；后端全量 524 项通过、6 项按原配置跳过，之后新增的公开分享脱敏用例也已通过。
- 下载日志专项 10 项通过，覆盖 JSONL 保存/清理/容量/故障、HTTP 流、鉴权、字段校验、限流、取消和公开分享脱敏。
- 浏览器验收覆盖预览成功、缓存复用、日志接口不可用时仍能预览，以及本机真实 HTTP 原生文件保存；已有图片预览的 7 个浏览器场景通过。
- 新增客户端计时模块覆盖率：行 98.43%、分支 91.8%；后端日志模块覆盖率：行 94.78%、分支 82.17%（格式化前采集）。
- workspace 类型检查、前后端构建、OpenAPI 合约、架构与部署边界检查、手动汇总脚本测试通过。
- 默认 `npm run lint` 会扫描本机历史 `.deploy-artifacts/source-*` 副本，导致多个配置根目录冲突；排除该产物目录的 `npx eslint . --ignore-pattern '.deploy-artifacts/**'` 通过。未为此修改项目 lint 配置。

本轮没有推送 Git、部署生产或创建定期检查任务；生产启用仍需正式应用发布。
