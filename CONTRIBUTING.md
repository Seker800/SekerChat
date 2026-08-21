# Contributing

感谢你为 SekerChat 做贡献。

## Development setup

1. 使用 Node.js 22 和 Docker。
2. 按 [`APP/docs/local-dev-runbook.md`](./APP/docs/local-dev-runbook.md) 启动本地开发环境。
3. 开发环境只能连接本机 PostgreSQL 和 MinIO，不能连接维护者的生产数据面。
4. 真实密钥只写入 Git 忽略的本地环境文件，不得提交数据库 dump、对象样本或运行日志。

## Pull requests

- 一个 PR 只处理一个内聚问题。
- 行为变更需要相应测试；UI 变更需要可见结果验证。
- 不要提交生成目录、`.env*`、`.local/`、测试报告或生产数据。
- 提交前至少运行与改动相关的测试，并尽量运行：

```bash
cd APP
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run architecture:check
npm run open-source:check
npm run security:audit:ci
```

提交信息使用 [`APP/docs/Commit规范.md`](./APP/docs/Commit规范.md) 中的中文类型前缀。

## Security reports

安全问题不要提交公开 Issue，参见 [`SECURITY.md`](./SECURITY.md)。
