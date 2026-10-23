# 图文混合粘贴

工作区输入框收到含图片的剪贴板内容时，会直接按原有图文顺序发送多条消息，无需再点发送。纯文字粘贴仍进入草稿；原有草稿不会混入自动发送的内容。

## 实现边界

- 使用浏览器原生 `paste` 事件同步读取 `text/html`、`text/plain` 和图片文件，不增加编辑器依赖。
- HTML 只在脱离页面的文档中遍历，提取文字、换行和图片，不执行或插入源 HTML。
- 有 HTML 时按文档顺序分段；只有纯文字和图片文件时，采用文字在前、图片按文件列表顺序在后的降级方式。
- 使用剪贴板图片文件、内嵌 PNG/JPEG/GIF/WebP/BMP 或浏览器能够读取的远程图片。远程下载不携带 SekerChat 凭据或 referrer，受浏览器 CORS 和现有 CSP 约束，不通过后端代理任意图片地址。
- 原平台只提供私有剪贴板格式、不可访问的本地或 blob 引用、需要登录的地址时，无法保证直接转换。图片读取失败会明确提示，不静默丢图或仅发文字。飞书、POPO 的真实兼容性需以各版本实际复制内容验收。
- 发送前读取并校验全部图片大小；下载同时检查实际字节数。长文字按现有消息接口的 10,000 字符限制拆分，不切断 UTF-16 代理对。
- 沿用现有分片上传和消息创建接口，单批逐项等待确认。同一频道的连续粘贴排队，切换频道不会改变原批次的发送目标。
- 失败暂停该频道的粘贴队列，输入区展示已发送数量、错误、继续发送和丢弃剩余内容。继续发送复用失败项的消息幂等标识和已完成上传，已成功项不重发。
- 队列保存在当前工作区内存中。刷新、登出或离开工作区会中止后续操作并丢失尚未发送内容；已经提交的消息保留，不承诺整批原子提交。普通手动发送不加入粘贴队列。

## 本地验证

```bash
npm run test --workspace @sekerchat/frontend-react -- src/components/workspace/clipboard-content.test.ts src/components/workspace/useClipboardBatch.test.tsx src/components/workspace/Composer.test.tsx src/components/workspace/useComposer.test.tsx
npx playwright test tests/e2e/workspace-clipboard.spec.ts
npm run build --workspace @sekerchat/frontend-react
```

浏览器测试使用隔离的 API fixtures，覆盖按序自动发送、保留草稿、失败续发和不可读取图片，不访问生产数据面。
