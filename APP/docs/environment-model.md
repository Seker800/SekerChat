# Environment Model

SekerChat 现在采用单一环境口径：

- 群晖是纯生产
- 本机是纯开发
- 生产数据只允许单向复制到本机做测试

## Production

生产环境固定在群晖，包含这四类服务：

- `frontend`
- `backend`
- `postgres`
- `minio`

职责边界：

- 群晖是唯一正式运行面
- 群晖不负责构建应用镜像
- 正式数据只留在群晖生产数据面

发布方式：

1. 在本机构建 `linux/amd64` 镜像
2. 导出为 tar.gz
3. 上传到群晖
4. 群晖执行 `docker load`
5. 群晖执行 app-only release 脚本：备份、显式 migration job、backend readiness、frontend

生产目录约定：

```text
/volume1/docker/sekerchat/
  docker-compose.yml
  release.sh
  rollback-app.sh
  .env
  backup.sh
  data/
    postgres/
    minio/
  images/
  backups/
    postgres/
```

正式生产入口：

- `APP/deploy/synology/docker-compose.yml`
- `APP/docs/synology-deployment.md`

`APP/deploy/synology/docker-compose.yml` 只包含应用服务和显式 migration profile；
PostgreSQL/MinIO 定义位于 `maintenance/`，正常发布命令永远不引用它。

## Development

开发环境固定在本机。

代码运行方式：

- 前端本机裸跑：`npm run dev:frontend`
- 后端本机裸跑：`npm run dev:backend`

数据面运行方式：

- PostgreSQL 通过 `APP/deploy/local-dev/docker-compose.yml` 运行
- MinIO 通过 `APP/deploy/local-dev/docker-compose.yml` 运行

本机目录建议：

```text
~/sekerchat-dev/
  compose/
  runtime/
  imports/
```

如果直接复用仓库内模板，至少要保持这三类职责：

- `compose/`：本机开发数据面的 compose
- `runtime/`：本机开发数据
- `imports/`：从生产导入的快照或对象样本

开发硬规则：

- 本机开发环境绝不直连群晖生产数据库
- 本机开发环境绝不直连群晖生产 MinIO bucket
- 本机迁移、测试、脚本不得直接打生产数据面

## Production Data Copy

允许的数据路径只有一条：

1. 群晖导出 PostgreSQL dump
2. 复制 dump 到本机 `imports/`
3. 恢复到本机开发库
4. 必要时脱敏
5. 本机前后端只连接本机恢复后的数据

如需对象存储样本，也只允许：

1. 从生产导出少量测试对象
2. 复制到本机
3. 导入本机 MinIO

禁止事项：

- 本机代码直接连接群晖生产 PostgreSQL
- 本机代码直接连接群晖生产 MinIO
- 开发脚本、迁移、测试直接操作生产数据

## Release Model

每个可发布版本必须绑定三样东西：

- `APP/package.json` 的 `version`
- Docker image tag
- Git tag

示例：

- package version: `0.4.0`
- frontend image: `sekerchat-frontend:v0.4.0`
- backend image: `sekerchat-backend:v0.4.0`
- git tag: `v0.4.0`

推荐顺序：

1. 本机完成开发
2. 本机验证通过
3. 把根包和所有 workspace 更新为同一个、从未使用过的新版本号并提交
4. 使用完全一致的 `v<version>` 构建并导出镜像；构建脚本会拒绝版本不一致或带临时后缀的 tag
5. 群晖部署
6. 群晖验证通过后，在同一个发布提交上打 annotated Git tag

不要复用已经构建过的镜像 tag，也不要在群晖验证前提前打正式 Git tag。
