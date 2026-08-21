# NAS SSH 访问（Docker 管理）

SekerChat 的 MinIO 和 PostgreSQL 跑在群晖 NAS 上，通过本机 SSH 别名 `nas` 管理。
真实局域网地址只保存在维护者的本机 SSH 配置中，不写入版本库。

常用命令：
- `ssh nas "sudo /usr/local/bin/docker ps"` — 查看容器状态
- `ssh nas "sudo /usr/local/bin/docker logs --tail 50 sekerchat-minio"` — 查看 MinIO 日志
- `ssh nas "sudo /usr/local/bin/docker restart sekerchat-postgres"` — 重启数据库
- `ssh nas "sudo /usr/local/bin/docker restart sekerchat-minio"` — 重启 MinIO

注意：必须用完整路径 `/usr/local/bin/docker`，不能只写 `docker`。

详细文档见 `~/nas-ssh-ai-guide.md`。

---

# 默认先研究

在写代码之前，先花一点时间确认是否已经存在可复用的方案。

默认工作流：
1. 先检查本地代码库和已有实现。
2. 遇到框架、库、API、SDK、工具链或对版本敏感的问题时，先查官方文档或一手资料，再动手编码。
3. 在新增代码前，先确认目标行为是否已经可以通过配置、现有工具、内建能力或成熟模式实现。
4. 如果发现大概率可复用的现成方案，优先采用或展示最小改动来复用它，而不是重写一套自定义实现。
5. 只有当任务完全是本地性的、信息稳定，且答案从仓库本身已经足够明确时，才跳过外部研究。

执行规则：
- 在你能明确说明“当前采用哪一种现有方案”之前，不要直接进入实现；如果没有找到合适方案，也要明确写出这一点。
- 优先做有针对性的检索，并优先使用一手文档，不要做大范围、猜测式编码。
- 如果用户询问 latest、current、recommended、official 或 best-practice 方案，回答或编码前必须先核实。
- 研究阶段要控制时长，保持务实，不要因为不必要的浏览而拖慢简单的本地修复。
- 当前工程入口是 `APP/`。实现、构建、测试和本地开发命令默认在 `APP/` 下执行。
- 默认优先阅读 `APP/docs/environment-model.md`、`APP/docs/local-dev-runbook.md` 和 `APP/docs/synology-deployment.md`，再进入实现文件。
- 修改群组工作区侧边栏或共享 `cli-*` 布局时，先读 `APP/docs/workspace-sidebar-agent-notes.md`。
- 修改群组工作区的数据加载逻辑时，不要把加载失败和“没有群组 / 没有 session”的空状态合并成同一种状态。如果 `GET /api/groups` 失败，工作区必须展示明确的错误状态、后端错误文本，以及重试操作。
- 在认定群组工作区“缺少 UI 元素”之前，先验证数据平面：`cd APP/apps/backend && npx prisma migrate status --schema prisma/schema.prisma`，以及 `cd APP && npm run smoke:groups`。

# 默认执行原则

这些规则用于补足项目 agent 的通用执行质量要求。

- 不要编造文件路径、命令、测试结果、接口行为或“已完成”状态；不确定就先读文件、跑命令、查文档，再下结论。
- 有两种以上合理解释且会影响结果时，先把分歧点说出来，再问一次，不要默默选一种继续做。
- 只改和当前请求直接相关的内容；不要顺手重构、顺手改格式、顺手清理无关代码。
- 先定义成功标准，再做验证；没有实际验证结果，不要宣称任务已经完成。
- 对 UI 改动，除了代码检查，还要做可见结果验证；能截图、跑 review 或 smoke 的，就不要只靠肉眼想象。

# SekerChat 环境边界

这个仓库采用“同一套程序，两套运行环境”的模型，不是开发/生产两套代码。

环境定义：
- 生产环境：整套运行在群晖 NAS，包括 `frontend + backend + postgres + minio`。
- 开发环境：整套运行在本机，包括本机 `frontend + backend`，以及本机 Docker 里的 `postgres + minio`。
- 两套环境长期并存；不要通过覆盖同一个 `.env` 来回“切换”。
- 区别只能来自配置、数据面和部署入口，不应该来自业务代码分叉。

本机开发入口：
- 本机数据面使用 `APP/deploy/local-dev/docker-compose.yml`。
- 本机后端开发配置使用 `APP/apps/backend/.env.development.local`。
- 本机生产参考配置可放在 `APP/apps/backend/.env.production.reference.local`。
- 这些 `.env*.local` 文件是本机私有文件，默认被 Git 忽略，不要提交。
- 启动开发后端必须用 `cd APP && npm run dev:backend`，它会通过 `APP/scripts/run-backend-dev.sh` 自动读取开发配置。
- 不要让 agent 手工把 `APP/apps/backend/.env` 在生产指向和开发指向之间覆盖来覆盖去。

生产入口：
- 群晖生产 compose 使用 `APP/deploy/synology/docker-compose.yml`。
- 群晖生产真实配置使用群晖上的 `deploy/synology/.env`。
- 本机开发任务不得修改群晖生产 `.env`，不得把本机开发命令指向群晖生产数据库或生产 MinIO。

安全硬规则：
- 本机开发环境绝不直连群晖生产 PostgreSQL。
- 本机开发环境绝不直连群晖生产 MinIO bucket。
- 不要在开发任务里运行会写入群晖生产 PostgreSQL 或 MinIO 的命令。
- 如果需要真实数据，只允许“生产导出 -> 拷贝到本机 -> 本机恢复/脱敏 -> 本机使用”的单向流程。
- 涉及数据库迁移、seed、smoke 或脚本执行前，先确认 `DATABASE_URL` 指向本机开发库，除非用户明确要求生产维护。

# 生产访问拓扑约束

生产排障时，必须先区分“NAS 局域网服务端口”和“用户真实访问入口”，不要把两者混为一谈。

- 当前生产前端容器在 NAS 上监听 `8080`，backend 监听 `3100`，MinIO 监听 `9000/9001`。
- 用户实际对外访问入口可能不是 NAS 直连端口，而是通过路由器端口转发后的外网入口。
- 当前已知用户对外访问前端使用 `5173`，这是路由器转发端口，不是 NAS 本机监听端口。
- agent 位于局域网内时，不能用“NAS 上没有监听 5173”直接否定用户说的外网访问入口；要先判断是否存在 NAT、端口转发或反向代理。
- 排查图片、文件、预览、下载问题时，必须分别核对：
  `用户访问页面的真实外网入口`
  `backend 返回给浏览器的真实对象存储入口`
  `NAS 容器内部实际监听端口`
- 如果用户报告“平时就是通过某个外网端口访问”，默认先相信这是外网映射信息，再去核对转发链路，而不是先按局域网直连方式反驳。

# 默认自动提交

在这个仓库里，Codex 在安全的前提下应当在实现过程中自动创建检查点提交。

提交策略：
- 完成一个内聚的里程碑后，直接创建提交，不需要额外等待用户提示。
- 里程碑指边界清晰、可复查的一小段工作，例如一次 bug 修复、一个完成的 slice、一步完成的重构，或一项已验证的文档更新。
- 自动提交前，在可行时先做有针对性的验证，例如测试、lint、build 或任务相关的 smoke check。
- 只暂存属于该里程碑的文件，不要把无关的已修改文件一起扫进同一个提交里。
- 如果工作区里已经存在无法干净分离的用户改动，不要自动提交这些文件。继续完成当前工作，并说明因为工作区无法安全隔离而跳过了自动提交。
- 不要自动提交明显未完成的工作、临时调试改动、会破坏构建的改动或失败的实验，除非用户明确要求创建 WIP 快照。
- commit message 规范只看 [`APP/docs/Commit规范.md`](APP/docs/Commit规范.md)；所有执行者统一使用中文类型前缀，不添加 `codex:`、`claude:` 等工具或身份前缀。
- 如果外部 skill、CLI 默认模板或历史过程文档示例与提交规范冲突，以 `APP/docs/Commit规范.md` 为准。

安全规则：
- 除非用户明确要求，否则绝不重写或 amend 现有提交。
- 绝不自动 push。除非用户明确要求 push，否则只创建本地提交。
- 如果不能确定某个检查点是否安全、是否逻辑完整，优先跳过自动提交，并说明原因。

沟通要求：
- 自动提交成功时，要说明做了哪些验证以及提交信息是什么。
- 因安全原因跳过自动提交时，简要说明具体阻塞点。

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **SekerChat** (8385 symbols, 20234 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/SekerChat/context` | Codebase overview, check index freshness |
| `gitnexus://repo/SekerChat/clusters` | All functional areas |
| `gitnexus://repo/SekerChat/processes` | All execution flows |
| `gitnexus://repo/SekerChat/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
