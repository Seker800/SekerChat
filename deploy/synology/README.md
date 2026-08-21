# 已废弃的群晖部署目录

该目录保留用于识别旧入口，不再是 SekerChat 的正式部署来源，也不要再把整个目录上传到群晖。

当前权威入口：

- 部署文件：[`APP/deploy/synology/`](../../APP/deploy/synology/)
- PostgreSQL 备份脚本：[`APP/deploy/synology/backup.sh`](../../APP/deploy/synology/backup.sh)
- 生产环境定义：[`APP/docs/environment-model.md`](../../APP/docs/environment-model.md)
- 群晖运行手册：[`APP/docs/synology-deployment.md`](../../APP/docs/synology-deployment.md)

本目录的 `backup.sh` 仅作为仓库内兼容转发器，实际执行 `APP/deploy/synology/backup.sh`。
