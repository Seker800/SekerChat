# SekerChat v0.9.12

## 新增

- Server 栏折叠时也可从操作菜单直接打开“新建 Server”对话框。

## 修复

- 网站标题保持纯产品名称，不再附加营销后缀。
- 升级 Multer、Sharp 及相关间接依赖，消除本次发布前检查发现的新增 High 级安全公告。
- OpenAPI 契约检查使用隔离的文档环境，并延迟加载应用模块，不再依赖本机或生产秘密。
- reminder 测试只扫描源码目录，兼容新版 Vitest 且避免重复执行编译产物。

## 部署说明

- 本版本没有新增数据库迁移。
- 按 app-only 发布流程替换 frontend/backend，不停止或重建 PostgreSQL、MinIO。
