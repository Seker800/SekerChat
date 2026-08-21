# HTTP API 发布契约

SekerChat 的 HTTP 发布契约由后端 DTO 与控制器上的 OpenAPI 响应声明生成，提交产物为：

- `contracts/openapi.json`：语言无关的发布契约；
- `packages/contracts/src/generated/openapi.ts`：供 Web、Reminder 等 TypeScript 消费者使用的生成类型。

这两个文件都是生成物，不得手工修改。修改 auth、groups、messages、uploads、files 或 subscriptions 的请求/响应后，运行：

```bash
cd APP
npm run contracts:generate
npm run contracts:check
npm run typecheck
```

`contracts:check` 会重新完整编译 Swagger 元数据（不复用增量编译缓存），校验 OpenAPI JSON 与生成类型没有过期，并拒绝缺少响应字段定义的公开端点。CI 还会编译前端/Reminder，并运行 CLI 的公开路由 contract test。

## 边界规则

1. 领域服务可以返回内部模型；控制器必须用 `*.dto.ts` 发布稳定的请求和响应模型。
2. API DTO 是网络边界，不是 React 组件状态。前端纯读取模型可直接使用生成类型；消息等需要乐观状态的模型必须以生成 DTO 为基础，再增加仅 UI 使用的字段。
3. 文件流、缩略图等二进制响应必须声明 media type 与 `binary` schema。
4. `POST` 默认返回 201，文档必须使用 created response；除非控制器用 `@HttpCode` 明确改变运行时状态码。
5. 字段删除、重命名、改为必填或改变含义属于破坏性变更。必须先扩展服务端和消费者，保留兼容窗口，再删除旧字段。
6. OIDC 跳转页和静态 relay script 不是 JSON 客户端契约，使用 `ApiExcludeEndpoint` 排除。

OpenAPI JSON 的代码评审差异就是契约评审记录；生成文件未同步时 CI 会直接失败。
