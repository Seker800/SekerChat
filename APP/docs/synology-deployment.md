# Synology Production Deployment

本文是 SekerChat 群晖生产发布的唯一操作手册。环境边界以
[`environment-model.md`](./environment-model.md) 为准，数据库迁移安全规则以
[`database-migration-runbook.md`](./database-migration-runbook.md) 为准。

## 固定拓扑

- NAS：通过维护者本机 SSH 别名 `nas` 访问，真实地址不写入版本库
- Docker：`/usr/local/bin/docker`（必须使用完整路径）
- 生产目录：`/volume1/docker/sekerchat`
- 正式入口：`deploy/synology/docker-compose.yml`
- 正式 compose 只有 `frontend`、`backend` 和显式 profile 下的 `migrate`
- PostgreSQL、MinIO 是长期数据面，不属于正常应用发布
- 数据面定义只保存在 `deploy/synology/maintenance/docker-compose.yml`，仅用于人工维护
- 应用与数据面连接既有 external network，默认名 `sekerchat_sekerchat`

正常发布不得停止、删除或重建 `sekerchat-postgres`、`sekerchat-minio`，不得修改其数据目录。

## 版本与产物

发布版本必须同时匹配：

- `APP/package.json` 与 backend、frontend、reminder、contracts、shared 发布 workspace 的 version
- Docker tag `v<version>`
- 验证成功后创建的 Git tag

本机在 `APP/` 构建：

```bash
npm run build:synology-images -- v0.8.0
```

`.deploy-artifacts/` 会包含两个镜像压缩包、SHA-256 清单和记录 Git SHA/镜像 ID 的
release metadata。CI 同时为两个镜像生成 SPDX JSON SBOM。上传后先执行：

```bash
sha256sum -c sekerchat-v0.8.0.sha256
```

不要复用已经构建过的 tag。

`mobile-shell` 是独立分发且 `private` 的壳工程，使用自己的版本号，不参与服务端镜像 tag；
`npm run deployment:check` 会校验所有服务端发布 workspace 的版本一致性和 compose 边界。

## 首次准备

将以下文件放入 `/volume1/docker/sekerchat/`：

- `docker-compose.yml`
- `.env`
- `backup.sh`
- `verify-app-compose.sh`
- `release.sh`
- `rollback-app.sh`
- `memory-monitor.sh`

并授权：

```bash
ssh nas "chmod +x /volume1/docker/sekerchat/{backup,verify-app-compose,release,rollback-app,memory-monitor}.sh"
```

生产 `.env` 至少包含 `APP_IMAGE_TAG`、数据库、认证、对象存储和真实访问入口配置。
内部对象存储地址通常为 `S3_ENDPOINT=http://minio:9000`。如果存在外网和局域网两个前端入口，
`CORS_ORIGINS` 必须同时列出。可信代理网段必须与 external network 中 frontend 的固定地址一致。

## 固定发布顺序

1. 本机构建、验证 checksum/SBOM，上传并 `docker load` 新镜像。
2. 旧 frontend/backend 保持运行。
3. `release.sh` 验证 app-only compose，数据库备份成功后才继续。
4. 使用新 backend 镜像执行 Prisma schema preflight。
5. 单独运行一次 `migrate deploy`；失败立即停止，旧应用继续运行，新应用不启动。
6. 迁移成功后替换 backend，等待 `/api/health/ready`。
7. 替换 frontend，记录 image ID/digest。
8. 执行登录、消息、文件上传和 realtime smoke。

上传及加载示例：

```bash
scp .deploy-artifacts/sekerchat-{frontend,backend}-v0.8.0.tar.gz nas:/volume1/docker/sekerchat/images/
ssh nas "gzip -dc /volume1/docker/sekerchat/images/sekerchat-backend-v0.8.0.tar.gz | sudo /usr/local/bin/docker load"
ssh nas "gzip -dc /volume1/docker/sekerchat/images/sekerchat-frontend-v0.8.0.tar.gz | sudo /usr/local/bin/docker load"
```

执行发布：

```bash
ssh nas "cd /volume1/docker/sekerchat && sudo APP_IMAGE_TAG=v0.8.0 bash ./release.sh"
```

群晖 Container Manager 如果只提供独立的 `/usr/local/bin/docker-compose`，使用：

```bash
ssh nas "cd /volume1/docker/sekerchat && APP_IMAGE_TAG=v0.8.0 SEKERCHAT_COMPOSE_BIN=/usr/local/bin/docker-compose bash ./release.sh"
```

发布脚本不会引用 maintenance compose，也不会对 postgres/minio 执行 `up`、`stop` 或 `rm`。

## MinIO 应用权限

应用的分片上传需要 `s3:ListMultipartUploadParts` 和 `s3:AbortMultipartUpload`。首次部署或策略更新后，在 NAS 的生产目录执行：

```bash
sudo bash ./apply-minio-app-policy.sh
```

脚本读取同目录 `.env`，只覆盖 `sekerchat-app-policy` 并重新附加给 `S3_ACCESS_KEY_ID` 对应的应用用户；
不会轮换凭据、重启容器或修改 bucket 数据。`mc admin policy create` 失败时脚本会直接退出，避免继续使用旧策略。

## 健康与验证

- `/api/health`：旧客户端兼容的轻量存活检查
- `/api/health/live`：只判断 Node 进程可响应
- `/api/health/ready`：带 2 秒超时检查关键配置、PostgreSQL 和 MinIO bucket

发布后检查：

```bash
ssh nas "sudo /usr/local/bin/docker ps --format 'table {{.Names}}\t{{.Status}}'"
NAS_LAN_IP=your-nas-lan-ip
curl -fsS "http://${NAS_LAN_IP}:8080/api/health/ready"
```

然后验证登录、发送消息、文件上传/预览、server 切换和 WebSocket 重连。当前正式用户入口为
`https://yuntai.design:5173`；不要把它与 NAS 本机的 HTTP 回源端口 `8080` 混为一谈。

## HTTPS 入口（2026-10-23）

当前链路为：公网/内网回流 TCP `5173` → NAS DSM HTTPS `5173` →
`http://127.0.0.1:8080` → frontend 同源 API / WebSocket 代理 → backend。
OpenWrt 的既有 `pf_sekerchat` 只将目的端口从 `8080` 改为 `5173`，保留原域名、
公网端口及 NAT reflection；其他映射、DDNS 和 OpenClash 配置未变。

DSM 规则名为 `SekerChat HTTPS`，来源主机名为 `yuntai.design`，已添加 DSM 内建
WebSocket 请求头，回源 HTTP 1.1，连接超时 60 秒，发送/读取超时 600 秒。
仅将该服务绑定已有的有效 ZeroSSL ECC 域名证书，未改变 DSM 系统默认证书或其他服务绑定。
证书北京时间 2026-12-09 到期；直接使用 NAS IP 访问不属于域名证书的覆盖范围。

生产私有 `.env` 的入口配置为：

```env
APP_BASE_URL=https://yuntai.design:5173
API_BASE_URL=https://yuntai.design:5173/api
CORS_ORIGINS=https://yuntai.design:5173
OIDC_REDIRECT_URI=https://yuntai.design:5173/api/auth/oidc/callback
S3_PUBLIC_ENDPOINT=
```

浏览器统一使用域名 HTTPS；旧 HTTP/IP 页面不再作为登录入口。`APP_BASE_URL` 决定会话
Cookie 的 Secure 属性，不能只改路由器或浏览器地址。文件继续通过同源代理，不新增
MinIO 公网端口。OIDC 回调地址已同步，但 DSM SSO 提供方的回调注册和完整 OIDC 登录尚未验收；
其既有 5001 入口仍分配过期默认对象，属于独立证书维护项。

本次复用 v0.9.22 镜像，仅重建 backend 使环境变量生效；无源码、镜像、schema 变更，
未运行迁移、重建或手工修改 PostgreSQL/MinIO。先通过 app-only 边界校验与 Compose
`config --quiet`，再重建 backend，待健康后切换路由映射。

已验证：NAS 直达及域名 NAT 回流证书校验成功、首页 200、ready；全新 Chrome 无痕窗口显示
“连接是安全的”及登录表单；正确来源的合成错误登录为 401，外部来源为 403；WSS 代理
返回 101，未认证连接按应用规则以 4401 关闭。运行镜像中的会话服务用惰性测试令牌调用，
两枚 Cookie 配置均为 Secure、HttpOnly、SameSite Lax（未生成真实会话或写入数据库）；
本机会话与来源校验测试 6 项通过。已有浏览器会话下相册缩略图和全屏大图预览均正常显示。
尚未验收全新账号登录、真实上传、消息发送或家庭外移动网络；未认证接口响应不能代替这些验收。

DSM 5001 的过期证书在局域网直连和域名回流下均可重现，并非局域网本身不支持 HTTPS。
Chrome 常规窗口曾允许该域名的证书错误内容，安全面板因此仍显示 broken HTTPS，
同时明确说明当前 5173 证书有效且 TLS 1.3 连接安全；全新无痕窗口未出现这一状态。
不要通过关闭证书校验解决问题，也不要将旧浏览器状态误判为新入口证书失效。

续期沿用 NAS 的 `acme-sh-syno`：已只读确认阿里云 DNS-01、ZeroSSL、cron 与
`synology_dsm` 部署钩子，配置的下次续期时间为北京时间 2026-11-25 11:33。
尚未实测下一次自动续期或核对部署目标与 DSM 对象的完整对应关系；续期后需检查
5173/8181 实际证书与服务绑定，不安装重复续期器。

回滚资料：NAS `backups/https-20261023/` 保存切换前 `.env` 与 compose（私有，勿提交）；
本机 `.omx/backups/openwrt-pre-sekerchat-https-20261023.tar.gz` 保存路由器完整配置
（含秘密，勿公开）。回滚时先恢复生产入口配置、用当前镜像仅重建 backend 并验证健康，
再将 `pf_sekerchat.dest_port` 恢复 `8080`，经 `fw4 check` 后提交并重载防火墙。
只撤销本次代理时必须先恢复映射；不要整机覆盖旧路由备份或触碰数据面。

## 生产内存趋势监控

后端容器预算为 1 GiB RAM、RAM 与 swap 合计 1536 MiB。共享图像策略关闭 libvips 操作缓存，运行镜像设置 `MALLOC_ARENA_MAX=2`，避免串行历史预览任务仍保留原生解码内存。约 94 MP 的渐进式 JPEG 单次解码需要约 550 MiB，不能以压缩文件大小或普通 PNG 的占用估计。报告按每条采样的实际容器限额判断内存余量。

发布涉及图片处理时，在本机使用实际候选镜像验证连续解码；输入为至少 90 MP 的渐进式 JPEG，可使用私有导出样本，不提交图片。该检查禁用网络与 swap，限制 1 GiB，并预留 220 MiB 模拟 API 占用：

```bash
node scripts/smoke-image-memory.mjs sekerchat-backend:v<version> /absolute/path/to/progressive-sample.jpg
```

此检查必须在独立临时容器运行，不能通过 `docker exec` 把额外的 Node/Prisma/解码验收进程塞入线上后端配额。图片处理仍复用串行任务队列与持久化重试状态；该预算覆盖已验证样本，不表示任意尺寸文件都有固定内存上限。

`memory-monitor.sh` 在群晖上运行，只读取 `/proc` 和 Docker 容器状态，不读取 `.env`、数据库内容或对象存储文件，也不会重启容器。默认每分钟采样一次，连续运行 48 小时，结果保存在群晖的 `monitoring/data/`。

在本机上传并启动：

```bash
ssh nas "umask 077; dd of=/volume1/docker/sekerchat/memory-monitor.sh status=none; chmod 755 /volume1/docker/sekerchat/memory-monitor.sh" < deploy/synology/memory-monitor.sh
ssh nas "cd /volume1/docker/sekerchat && bash ./memory-monitor.sh start --duration-hours 48 --interval-seconds 60"
```

群晖 SSH 未启用 SCP/SFTP 子系统，所以这里使用 SSH 标准输入传文件。

查看状态或提前停止：

```bash
ssh nas "cd /volume1/docker/sekerchat && bash ./memory-monitor.sh status"
ssh nas "cd /volume1/docker/sekerchat && bash ./memory-monitor.sh stop"
```

监控完成后，把 CSV 拉回本机再生成 Markdown、SVG 趋势图和 JSON 摘要：

```bash
mkdir -p .local/production-memory
ssh nas "tar -C /volume1/docker/sekerchat/monitoring -czf - data" > .local/production-memory.tar.gz
tar -xzf .local/production-memory.tar.gz -C .local/production-memory --strip-components=1
npm run monitor:memory:report -- .local/production-memory/memory-*.csv
```

报告程序返回 `0` 表示正常、`1` 表示需要观察、`2` 表示高风险。已有 swap 占用不会因为应用重启立即消失；应结合 swap 增量、换入/换出页、容器重启次数和 OOM 标记一起判断。

## 应用回滚

应用回滚只切换 frontend/backend 镜像，不执行 migration，不碰数据容器：

```bash
ssh nas "cd /volume1/docker/sekerchat && sudo APP_ROLLBACK_TAG=v0.6.9 bash ./rollback-app.sh"
```

只有确认旧版本与当前 schema 兼容时才允许回滚。expand-contract 兼容窗口内通常可以直接回滚；
涉及 contract/drop 的版本必须先按数据库迁移手册恢复备份或执行经过演练的 forward fix。

## 数据恢复

`backup.sh` 只有在 `pg_dump`、gzip 完整性、非空大小和 PostgreSQL 完成标记全部通过后，才会把
`.partial` 原子改名为正式备份并生成 `.sha256`。数据库恢复是单独的人工事故流程，会覆盖数据，
不能由应用回滚脚本自动触发。

生产数据如需用于测试，只允许“生产导出 → 拷贝到本机 → 本机恢复/脱敏”的单向路径。


## 审查整改的本地准备（2026-10-22）

本轮只在本机修改和验证，没有更新 NAS 配置、创建生产计划任务、上传镜像或执行发布。

### 数据镜像与日志

三份 Compose 为所有服务显式设置 `json-file` 的 `10m × 3` 轮转。本机数据服务只绑定回环地址；生产 MinIO API 端口保持既有访问拓扑，控制台绑定回环地址。

maintenance Compose 不再提供浮动数据镜像默认值。未来人工维护前，先从**当时运行的数据镜像**取得 RepoDigest，将 `POSTGRES_IMAGE` 和 `MINIO_IMAGE` 加入生产 `.env`；模板见 `maintenance/data-images.env.example`。不要借此升级版本或直接重建数据容器。执行任何数据面操作前先运行 `maintenance/verify-data-images.sh`；它只读取这两个配置字段，不执行 `.env` 内容。Compose 使用父目录配置时必须显式传 `--env-file`。普通 app-only release 不读取这两个变量，也不触碰数据容器。

### 对象备份与恢复验收

`backup-objects.sh` 提供独立对象备份入口，依赖已安装的 `mc` 和 Python 3；凭据由维护者预先配置的 mc alias 管理，脚本不读取或打印凭据。

必填环境变量：

- `SEKERCHAT_OBJECT_BACKUP_SOURCE`：预先配置的 `alias/bucket`。
- `SEKERCHAT_OBJECT_BACKUP_DIR`：独立磁盘、远端挂载或灾备目录的绝对路径，不能指向活动 MinIO 数据目录。

脚本先记录对象清单，再复制对象、检查大小并生成 SHA-256 清单，校验通过后才原子发布带 `COMPLETE` 的目录。失败只留下 `.partial`，不得用它恢复；不自动删除旧备份。复验命令为 `python3 verify-object-backup.py verify <备份目录>`。

该备份不是 PostgreSQL 与 MinIO 的跨系统原子快照。第一次生产启用和恢复演练需要在维护窗口暂停写入、保留清理任务停止状态，生成数据库备份与对象备份，再恢复到隔离环境，核对消息附件、相册、产出和订阅文件均可读取。只有完成配对恢复演练后才能认定灾备闭环成立。后续由 NAS 计划任务定期执行数据库和对象备份，并对失败告警；本次未创建生产计划任务。

本机已验证成功备份、复制失败不发布和备份损坏检出；NAS 上的实际调度、独立存储和恢复演练仍需在明确授权的生产维护任务中执行。
