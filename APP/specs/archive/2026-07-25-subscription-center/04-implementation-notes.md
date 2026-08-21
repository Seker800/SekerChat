# 04-implementation-notes.md

## Schema / Contract Notes

- `SubscriptionPost` 独立于 `Group` 和 `Message`。
- `SubscriptionAttachment` 只属于订阅草稿/内容。
- `UploadSession` 通过明确目标字段关联群组或订阅内容，禁止双归属或无归属。
- 发布状态使用明确枚举，不用空时间字段推断全部状态。
- 阅读状态按用户保存最后阅读时间或事件游标，列表返回当前用户 `isRead`。

## Cross-slice Dependencies

- 前端 multipart 需要后端先返回订阅附件完成结果。
- 未读角标依赖订阅摘要 API 和实时事件类型。
- 发布按钮依赖草稿附件全部完成的服务端校验。

## Error Handling

- 列表加载失败必须显示错误文本与重试。
- 上传失败保留可恢复会话；主动取消才中止并清理。
- 发布失败保留草稿与已完成附件。
- 下载对象缺失返回明确 404；对象存储不可用返回 503。
- 撤回内容对普通用户表现为不存在。

## Validation Notes

- 测试恰好 5 GB 与大于 5 GB 的边界。
- 测试第 6 个附件被拒绝。
- 测试普通用户管理请求为 403。
- 测试草稿与撤回内容不可被普通用户读取或下载。
- 测试非法外链协议被拒绝。
- 测试 Range 与不合法 Range。

## Operational Notes

- 本地迁移前确认 `DATABASE_URL` 指向本机。
- 哈希以流式读取 S3 对象完成，避免 5 GB 内存占用。
- 孤儿 multipart 会话继续由清理服务回收；订阅草稿删除需清理其附件对象。
- 生产发布只通过既有群晖镜像流程，本任务不直接部署。
