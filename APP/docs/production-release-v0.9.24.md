# v0.9.24 群晖生产发布记录

2026-10-26 已完成生产发布。用户本次明确授权：先合并并验证全部依赖升级，再部署。

## 发布来源与范围

- 发布源码：本机 `main` 的 `6cc124e9405f903b1429fbcd0397a692e80fd99d`，本地附注标签 `v0.9.24` 指向该提交。
- 远端分支 API 核对的 12 个依赖分支最新提交均已包含于本机 main；其中本次合并此前未包含的 10 个分支。没有执行 GitHub push，不能将本机 main 与远端 main 的状态混称。
- 完成 NestJS 12 配套升级、Vite 8 / React 插件 6 配套升级、Vitest 5 以及其他依赖和镜像更新；后端保留 CommonJS 运行方式，通过 NodeNext 配置和 TS6 对齐 Swagger AST 编译器。
- 聊天图片预览在原图下载和解码期间复用独立持有的受保护缩略图，同时显示真实下载进度；原图可用后切换，保留重试与缓存行为。原先生产 v0.9.22 未包含已有进度改动。
- v0.9.23 候选镜像的实际迁移预检发现 Prisma 被 npm 提升到工作区根目录，旧的相对 CLI 路径不存在。正式 Compose 和发布脚本改用实际安装的绝对入口，并增加构建存在性检查及回归测试。候选版本没有发布生产；修复后另建不可变 v0.9.24 产物。

## 产物与生产状态

正式入口为 `apps/backend/Dockerfile`、`apps/frontend-react/Dockerfile` 和 `deploy/synology/docker-compose.yml`。镜像由干净的源码归档构建，没有混入任务前已有的工具文档修改。

| 项目 | 已核对结果 |
| --- | --- |
| backend 镜像配置摘要 | `sha256:1dfd9ce247f672acce64bc3e4a5aa39dc67b0620b6f9f6599931eaadd5423c3f` |
| frontend 镜像配置摘要 | `sha256:c8c4f65287ec5c30f842a5ba415de84441441bc3bdb0e5b636bd67aaac61b54d` |
| 上传完整性 | 两张镜像、两份 SBOM、release env、部署配置包与 preflight JSON 共 7 项 SHA256 校验通过 |
| 数据库备份 | `sekerchat-auto-2026-10-26_211546.sql.gz`，压缩大小 1,553,560 字节 |
| 备份 SHA256 | `f7cbabe682245e2ed0e276f0d594ed33439ca298e8b2809f0a8677b659cdd7af` |
| 迁移 | schema 校验通过，114 个迁移，无待执行迁移 |
| 应用健康 | backend / frontend 均 healthy，重启计数 0，OOMKilled=false |
| 持久版本 | NAS 私有环境文件中的 APP_IMAGE_TAG 已保存为 v0.9.24 |
| 数据服务 | PostgreSQL / MinIO 容器身份与启动时间均未改变 |

生产备份、旧环境和旧部署脚本留存在 NAS；旧 v0.9.22 镜像保留。未发布或打印生产凭据。

## 验收证据

- 后端源码单测 496 通过、5 项默认集成跳过；另对 TS6 实际编译产物运行同一套测试也是 496 通过、5 跳过。产物测试需按原只读路径布置 SQL 夹具，未修改断言。真实本机 PostgreSQL 并发票据消费和共享锁持久化集成测试 2 项通过。
- 前端 64 个测试文件、384 项通过；contracts 4 项、reminder 2 项通过。完整 Playwright 54 项通过。一次原生表单控件 34 像素差异经过实际截图对比后更新单张基线，未放宽阈值。
- workspace typecheck、正式后端/前端/reminder 构建、Vue lab 构建、lint、架构检查、部署脚本 12 项测试，以及 CI/API/依赖边界和包体积等门禁通过。
- 两张正式镜像在本机独立 PostgreSQL / MinIO 环境完成空库迁移和应用启动；使用正式 Compose 原文件验证迁移 CLI 及默认迁移命令。真实 HTTP / 浏览器验收覆盖 Cookie 登录、群组、消息幂等、上传完成幂等、WS 收发及重连、原图完整 SHA256、缩略图、限速下可见进度和等待缩略图，以及再次打开不重复下载。
- 实际编译页面的图片验收截图显示 7% 下载进度及缩略图，下载完成后原图显示。≥90MP 渐进式 JPEG 在 1GiB、无 swap、另预留 220MiB API 空间条件下进行 8 次解码，完成时 RSS 约 323–332MiB，通过既有内存验收脚本。
- Syft / Grype 扫描两张最终镜像，`--only-fixed --fail-on high` 均通过。前端无报告项；后端仍有 libbrotli negligible、katex low、js-yaml medium，不能宣称所有漏洞为零。npm 安全门禁仍使用既有 Prisma `GHSA-ggr8-5vv4-36mx` 例外。
- 生产使用现存有权限用户的短期内存令牌读取，无新建账号、消息或上传。通过真实 HTTPS 主机名完成 Bearer / Cookie 认证、未认证拒绝、群组及消息读取、现存缩略图、原图前段与 MinIO 相同范围的 SHA256 对比，以及 WSS 认证保活。Cookie 配置为 Secure / HttpOnly / SameSite=Lax。
- 本机按正常 DNS 访问用户真实 HTTPS 入口的 readiness 通过。NAS 临时容器按正常 DNS 访问该入口连接超时；后续将相同 HTTPS 主机名解析到 NAS 网关，保留完整证书校验，经 DSM 正式 HTTPS 反代完成上述认证和图片验收。该结果不代表已经独立验证所有公网客户端路径。
- 发布后短时采样 backend 约 139MiB / 1GiB、frontend 约 7.7MiB / 128MiB，CPU 低；未见此次发布造成的重启或内存耗尽。这是采样结果，不等于持续压测结论。

原始验收、截图、产物和审查记录保存在本机忽略目录 `.omx/artifacts/release-20261026/` 与 `APP/.deploy-artifacts/`。生产 postflight 单独记录，未回写或改变已上传的 preflight 校验产物。本次专用本机预检容器和网络已清理。

## 独立审查与限制

使用本机 DeepSeek Harness 独立只读审查，最终后端报告 `backend-reviews/deepseek-ljbqpmsj`、前端报告 `frontend-reviews/deepseek-kli9tk2l` 的绑定文件指纹均为 `review_current`，意见与独立判断分别留在 disposition。没有确认的发布阻断项。

低优先级意见包括独立图片租约缺少“虚拟行卸载”的直接场景测试，以及缩略图解码失败后租约保持到弹窗关闭。前者已有缓存测试及实际镜像验收但不能称为直接覆盖；后者资源有界、关闭释放且不影响原图，本次未新增状态协调逻辑。后端对编译器验证差异和 Compose 静态断言不足的意见，分别用实际 TS6 编译产物测试与正式 Compose 真正执行补充证据。

历史兼容入口 `APP/docker/Dockerfile.frontend` 缺少 contracts 等问题早于本任务；它不承载正式 NAS 发布。本次没有扩大范围重写该入口，也不宣称该历史入口构建通过。

此次修复改善图片等待画面和进度反馈；原图可能达到约 68MB / 80MP，传输和浏览器解码仍有实际成本。尚未独立测量用户网络的原图吞吐，不能宣称网络瓶颈已经排除或下载带宽已提升。默认 groups smoke 的邮箱验证码获取失败不计为通过，已用隔离实际镜像和生产认证读取覆盖本次群组验收。

## 应用回滚

如需回退应用，在 NAS 部署目录执行现有脚本：

```sh
APP_ROLLBACK_TAG=v0.9.22 SEKERCHAT_COMPOSE_BIN=/usr/local/bin/docker-compose bash ./rollback-app.sh
```

回滚成功后，将私有环境文件中唯一 APP_IMAGE_TAG 恢复为 v0.9.22 并确认健康。该脚本只切换应用镜像，不回退数据库迁移、不替换 PostgreSQL / MinIO。本次没有新增待执行迁移，无需反向执行迁移。
