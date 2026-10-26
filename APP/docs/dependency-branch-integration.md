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


## 2026-10-26 后续更新

用户明确要求先合并全部更新、验证，再部署生产。已核对 GitHub 的 12 个依赖分支：
前端 Node 和 Electron 分支原提交已在 main；10 月 25 日新增的其余 10 个分支现均被 main 包含。
保留真实合并父提交；生成器和 React 插件的目标版本随成套升级先行应用，再解决分支合并冲突，
没有用旧锁文件覆盖新版业务或通过忽略 peer 约束强行安装。

- 正式前端更新为固定摘要的 Nginx 1.31.0；兼容 Docker 入口接收 Nginx/Node 摘要更新。
- NestJS common/core/platform/testing 统一为 12.2.0，配套 config、JWT、Passport、schedule、
  Swagger、throttler 和 CLI/schematics 升级到支持 v12 的版本。后端编译器为 TypeScript 6.0.3，
  CommonJS 项目使用 NodeNext 解析；动态 import 使用输出的 `.js` 扩展。
- Swagger 12 的 TypeScript peer 同时允许 5/6，但编译插件必须与 Nest CLI 使用同一份编译器 API。
  用 npm 的包级 override 将 Swagger 的 TypeScript 固定为其支持的 6.0.3；没有修改第三方源码或
  绕过 peer 版本范围。根工具链显式保留 TypeScript 5.9.3，以满足 openapi-typescript 的 TS5 peer；
  前端、reminder、contracts 保留 TS7，Vue 实验页保留 TS5。
- React 插件 6.1.2 配套 Vite 8.3.5；各 workspace 的 Vitest/coverage 统一为 5.0.5，jsdom 为 30.1.3。
  旧测试把 jsdom Blob 交给 Node 原生 Response，环境切换后不兼容，改为等价的响应字节和 MIME 头；
  浏览器 Blob/上传行为测试仍保留。锁文件从空的临时 workspace 用标准 npm 重新解析，再干净安装验证。
- 上传库固定为修复版本 multer 2.5.0；Electron 升至 44.9.3。安全门禁只沿用既有 Prisma 例外。
- Swagger 新元数据只为 4 个固定的 finalize kind 补全 enum，实际 HTTP 行为未变，8 个领域契约门禁通过。
- 54 项浏览器回归通过；原生表单控件截图差异仅 34 像素，已查看差异图后仅更新对应基线。
  图片错误验收在首个网络请求注入 503，避免浏览器解码缓存绕过第二次请求；重试完成和缓存复用分别验收。

依据：[NestJS 12 迁移说明](https://docs.nestjs.com/migration-guide)、
[Vite 8 迁移说明](https://vite.dev/guide/migration)、
[Vitest 5 迁移说明](https://vitest.dev/guide/migration/)、
[Vitest 的 jsdom 30.1 修复](https://github.com/vitest-dev/vitest/issues/11379)。

发布后的运行证据另见对应版本的群晖发布记录，不能以本地验证代替线上验收。
