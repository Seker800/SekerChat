# v0.9.28 群晖生产发布记录

2026-11-01 已按本次用户明确授权完成生产部署和上线后验收。

## 发布来源和行为

- 发布源码为 `13eebd83eafff696bdfb195811bab9cd377f64ec`，附注标签 `v0.9.28` 在生产验收通过后创建。根包及六个 workspace 版本统一为 `0.9.28`。
- 从干净 Git 归档构建 `linux/amd64` 前后端镜像，不包含工作区原有工具文档改动和未跟踪评审笔记。
- 特殊页面初始化可以跳过无关聊天消息；考勤只轮询当天数据，历史快照与平均值计算依据保留在缓存中。
- 后台暂停展示性刷新，WebSocket 消息接收、通知、心跳和可靠任务恢复继续运行；恢复前台或重连后合并校准。
- 相册共用轻量 revision 检查；文章浏览事件只更新受影响记录，保留已加载分页；实时刷新合并并发请求并补做读取期间到达的更新。
- 媒体队列在业务提交后唤醒，空闲检查逐步退避；Outbox 空闲时先只读检查，保留故障兜底。

本次仅部署群晖应用，没有执行 Git push 或创建 GitHub Release；本地分支与标签尚未同步远端。没有触发仅在实际 Git push 时启动的 DeepSeek 后台审核。

## 产物和生产状态

| 项目 | 已验证结果 |
| --- | --- |
| backend 配置摘要（NAS image ID） | `sha256:0a0c2bc6ac03ef0322f45d118a3c95dd0867b5b28ba61c20d636711925f20687` |
| frontend 配置摘要（NAS image ID） | `sha256:6e4b6be2a186f908da2eaf67a5be847432962924631d604c206c1d30c2dff0a3` |
| 上传完整性 | 两张镜像、两份 SBOM、release env、部署配置包、隔离验收结果共 7 项 SHA256 校验通过 |
| 数据库备份 | `sekerchat-auto-2026-11-01_222237.sql.gz`，压缩大小 1,676,940 字节 |
| 备份 SHA256 | `a60daca44d415869397e4173619fa25a7b78536e27000a1560e0ad963e601bfe` |
| 迁移 | schema validate 通过，115 个迁移均已应用，本次无新增迁移 |
| 前后端 | 均为 `v0.9.28`、healthy，重启计数 0，OOMKilled=false |
| 持久配置 | 私有 `.env` 唯一 `APP_IMAGE_TAG` 保存为 `v0.9.28`，原权限和所有权保留 |
| PostgreSQL / MinIO | 容器 ID、镜像和启动时间与发布前一致，未重建或重启 |
| 运行日志 | 发布后短时检查未见 ERROR、Unhandled 或 FATAL |

镜像 metadata 保留本机 OCI 索引摘要与导出配置摘要，NAS 按导出配置摘要精确核对。发布前私有环境、Compose、应用脚本以及旧版镜像保存在 NAS，应用先完成备份和迁移核对，再依次替换后端与前端。

Compose 提示既有 PostgreSQL 为 orphan，属于应用与数据服务拆分后的既有标签状态；未执行 `--remove-orphans`。
驱动脚本经 SSH 标准输入执行时，子命令消耗了后续输入，因此版本持久化另以独立 Python 步骤完成，并重新核对数据容器身份和启动时间；没有将应用切换成功直接视为持久配置已完成。

## 验收和限制

- 开发阶段后端 532 项通过、6 项既有集成测试按配置跳过；前端 443 项通过；相关浏览器回归 27 项通过。构建、合约、架构及定向 lint 检查通过。
- 发布阶段部署边界与脚本检查 12 项通过；实际最终镜像内运行 bootstrap、考勤、相册任务、Outbox 和空闲退避等编译产物测试 54 项，全部通过。
- 实际候选镜像使用独立本机 PostgreSQL、MinIO 和正式应用 Compose，完成迁移、Cookie 登录、群组、消息幂等、编辑提及、文章浏览去重、上传完成幂等、WebSocket 收发和重连、原图 SHA256、缩略图及编译后浏览器预览验收；限速时显示 6% 进度，重复预览不重下原图，下载诊断关联成功。
- 本机候选前端的 `localhost` 健康探针优先解析 IPv6，但 nginx 仅监听 IPv4；隔离环境仅将探针改为 `127.0.0.1` 后复核健康。生产未使用此本机覆盖；NAS 原探针解析为 IPv4，实际通过。
- npm 安全门禁通过，沿用已登记、精确限定的 Prisma 配置工具链例外 `GHSA-ggr8-5vv4-36mx`，没有新增例外。两张镜像生成 SPDX SBOM，以 2026-11-01 有效 Grype 库运行 `--only-fixed --fail-on high` 通过；前端无匹配项，后端仍有 KaTeX Low 与 js-yaml Medium，不代表漏洞为零。
- 生产通过现存有权限用户的短期内存令牌只读验收，验证内部及真实 HTTPS 入口 ready、Bearer/Cookie、未认证拒绝、群组消息读取、现存缩略图、原图范围 SHA256 与 MinIO 一致、WSS 认证保活和 Secure Cookie 配置。未创建生产测试账号、消息或上传。
- 新接口验收确认 `includeMessages=false` 返回空消息、相册 revision 为字符串、考勤面板返回平均值依据；历史文章浏览日期保留检查通过。
- 本机正常 DNS、完整证书校验访问实际 HTTPS 端口的 readiness 通过。NAS 认证读取沿用真实主机名映射至网关，保留证书校验。未独立验证所有公网运营商、移动网络或真实桌面客户端，也未把此次短时健康检查当作生产十分钟成本对照或持续压测。

证据位于本机忽略目录 `APP/.local/release-v0.9.28/`，镜像和 SBOM 位于 `APP/.deploy-artifacts/`，NAS 发布备份与日志位于 `releases/v0.9.28/`。隔离验收资源在验收后清理，证据保留。

## 应用回滚

本次没有数据库迁移变更，回滚目标为发布前的 `v0.9.27`。在 NAS 应用部署目录运行：

```sh
APP_ROLLBACK_TAG=v0.9.27 SEKERCHAT_COMPOSE_BIN=/usr/local/bin/docker-compose bash ./rollback-app.sh
```

回滚后同步私有环境文件中的 `APP_IMAGE_TAG` 并核对健康。回滚脚本不回退数据库，不替换数据服务。部署边界与日常操作见 [群晖部署手册](./synology-deployment.md)。
