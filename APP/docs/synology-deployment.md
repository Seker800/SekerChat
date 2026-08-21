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

然后验证登录、发送消息、文件上传/预览、server 切换和 WebSocket 重连。用户真实外网入口可能通过
路由器映射到 `5173`；不要把它与 NAS 本机监听的 `8080` 混为一谈。

## 生产内存趋势监控

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
