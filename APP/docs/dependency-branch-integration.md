# 依赖分支合并记录

2026-10-23 整理并合并 12 个 Dependabot 分支，保留其提交历史；没有发布到 NAS。
冲突以当前 main 的业务功能、运行配置和包版本为基础，只引入对应依赖更新，重新生成锁文件。

## 最终选择

- GitHub Actions：更新 artifact 上传和 Anchore SBOM / scan 的固定提交。
- Node：更新正式前后端构建入口及兼容 Docker 入口的镜像摘要，继续使用 Node 22。
- Nginx：正式入口保留 main 已固定的 `1.30.6-alpine`；旧分支基于浮动 `stable-alpine`，
  不用其旧摘要覆盖现有修复。兼容 Docker 入口接收对应摘要更新。
- React Query：`^5.102.8`；typescript-eslint：`^8.70.0`。
- jsdom：`^30.0.1`；jest-dom：`^7.0.1`。
- Electron：`44.2.0`，按上游要求最低支持 macOS 13。实测版本为 44.2.0。
- TypeScript：React 前端、reminder 和 contracts 使用 7.0.2；后端 Nest/Swagger/ts-node、
  Vue UI 实验页和 ESLint 的编译器 API 依赖继续使用兼容的 5.9.3。
  工作区分别声明依赖，由 npm 正常解析安装，不覆盖 peer 约束或补丁修改第三方包。
  reminder 和 contracts 的模块解析改为 NodeNext，保留各包现有 CommonJS 运行输出。

TypeScript 7 尚未提供稳定编译器 API，不能直接替换 Nest、Vue 和 ESLint 使用的编译器。
参见 [TypeScript 7 官方说明](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)。
Electron 的平台及 API 变更见 [Electron 44 官方说明](https://www.electronjs.org/blog/electron-44-0)。

## 验证

- `npm ci --ignore-scripts`：干净安装；另行生成 Prisma Client 并安装 Electron 运行时。
- 全 workspace 类型检查、前后端及 reminder 构建、Vue UI 实验页构建通过。
- 单测：contracts 4、backend 496、frontend 382、reminder 2 项通过。
  后端默认跳过 5 项需显式开启的集成场景，未将它们计为通过。
- 使用独立本机 PostgreSQL 容器，从空库完成 114 项迁移；认证票据并发消费和文件分享锁定
  的 2 项 PostgreSQL 集成测试通过，没有接触生产数据。
- 54 项 Playwright 浏览器测试通过。高负载首轮的历史滚动锚点测试曾失败，
  随后独立重复 3 次及完整复测均通过；未放宽断言或改动滚动业务逻辑。
- Electron 实机启动，检查窗口、preload IPC、未登录状态和空表单校验；测试使用临时用户目录。
- architecture、open-source、deployment、CI、API contracts、bundle 和 lint 检查通过。
  部署文档中的真实域名改为占位示例，保留拓扑说明，不改公开边界检查规则。
- 正式前后端 Linux amd64 Dockerfile 构建通过；隔离网络和临时 PostgreSQL/MinIO 下，
  后端 readiness、前端同源代理、认证边界和 Nginx 配置检查通过。
- npm 漏洞门禁通过，仅沿用已有 Prisma 风险登记；Grype 的 `--only-fixed --fail-on high`
  前后端镜像检查通过，未增加漏洞忽略项。
