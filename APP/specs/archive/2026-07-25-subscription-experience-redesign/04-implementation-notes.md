# 04-implementation-notes.md

## Schema / Contract Notes

- `SubscriptionPost` 保留 `title`、`body`、`tags` 和生命周期字段。
- 列表项返回 `bodyPreview`、`attachmentCount`、`hasAttachments`，不返回完整正文与下载明细。
- 详情返回完整正文和附件。
- 正文图片引用格式固定为 `attachment://<attachmentId>`。

## Cross-slice Dependencies

- 图片插入依赖 multipart 完成结果返回附件 ID。
- Markdown 图片渲染依赖详情附件白名单和鉴权下载 URL。
- 删除旧字段前必须先执行内容迁移 SQL。

## Error Handling

- 图片上传失败保留编辑器和可恢复上传状态。
- 引用不存在、非图片或不属于当前内容的附件时显示“图片不可用”。
- 详情失败保留返回列表与重试操作。

## Validation Notes

- 验证 HTML 转义、`javascript:` 链接和外部图片阻断。
- 验证中英文逗号、空格、回车和粘贴标签。
- 验证列表没有全文、点击详情才加载完整正文并标记已读。
- 验证没有新增图片专属限制。

## Operational Notes

- 迁移只在本机开发库执行和验证。
- 生产部署继续走既有群晖镜像和迁移流程。

## Completion Evidence

- RED checkpoint: `1ae7afd 新增: 定义订阅体验重构失败测试`
- Backend: 178 tests passed.
- Frontend: 155 tests passed.
- Browser smoke: 14 tests passed.
- Static checks: root lint and typecheck passed.
- Build: backend, frontend and reminder production builds passed.
- Data plane: `sekerchat_dev` at `localhost:5432`, 50 migrations, schema up to date.
- Visual review: `test-results/subscription-center.png` and `test-results/subscription-editor.png`.
