# Deprecated Deployment Note

这份文档描述的是旧方案，**不是当前正式部署口径**。

旧方案内容包括：

- Mac mini 裸跑业务逻辑
- 群晖只跑 PostgreSQL 和 MinIO
- 本机开发直接连接群晖数据面

上述方案现在已经降级为历史信息，不应继续作为当前真相源。

## Current official docs

当前正式口径见：

- [APP/docs/environment-model.md](./APP/docs/environment-model.md)
- [APP/docs/synology-deployment.md](./APP/docs/synology-deployment.md)
- [APP/docs/local-dev-runbook.md](./APP/docs/local-dev-runbook.md)

## Current model

当前唯一正式定义是：

- 群晖是纯生产
- 本机是纯开发
- 生产数据只允许单向复制到本机做测试
- 开发环境绝不反向碰生产
