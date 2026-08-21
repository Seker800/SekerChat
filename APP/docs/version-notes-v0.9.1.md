# SekerChat v0.9.1

> 本版本在 v0.9.0 生产候选基础上补充 SekerEagle 大图预览键盘导航，并包含 Eagle Worker 首次发布、独立发布与回滚流程的完善。

## SekerEagle

- 大图预览打开时可使用左右方向键切换当前素材列表中的上一张或下一张图片。
- 键盘导航自动跳过视频素材，并在到达列表边界时保持当前图片。
- 保留 Escape 关闭预览以及原有缩放、拖动交互。

## Worker 与发布

- Eagle Worker 具备独立健康检查、优雅退出以及首次发布失败清理。
- 支持仅替换或回滚 Worker，且不会执行数据库迁移、重启 backend/frontend 或触碰 PostgreSQL/MinIO。
- 完整应用发布仍按备份、迁移、backend、worker、frontend 的固定顺序执行。

## 版本

- 服务端发布 workspace 统一升级为 `0.9.1`。
- Docker tag 和生产验证后的 Git tag 使用 `v0.9.1`。
