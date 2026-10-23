# 网络出口提醒

登录后通过同源 `GET /api/network/status` 检查访问 SekerChat 的连接出口。
仅确认出口地区位于中国大陆以外时，在已有打卡卡片的位置显示网络提醒，只有“知道了”按钮。
点击立即关闭，本次登录页面内切换频道、私聊或管理页不重复提示；刷新或重新登录后重新检测。
原有打卡状态独立维护，关闭网络提醒后可继续显示打卡卡片。窄屏沿用已有频道侧栏入口。

该提醒不证明用户使用了代理，也不把境外出口等同于故障。检测失败、未知地区、内网和其他
特殊用途地址均不提示，不阻塞登录或聊天。前端检测超时为 5 秒，不做周期轮询。

## 数据和信任边界

- 接口要求现有浏览器认证，只返回 `showWarning`，不返回 IP，也不新增 IP 业务存储；
  既有全局请求日志仍按原规则记录来源 IP。
- 只读取 Express 已按 `TRUSTED_PROXY_CIDRS` 解析的 `request.ip`，不接受客户端指定待查 IP。
- 响应禁止缓存。代理配置仍以部署手册为准；路由器或其他代理若隐藏了来源地址，返回未知而非猜测。
- 国家数据随 `geolite2-country` npm 包锁定在镜像中，由 `mmdb-lib` 本地读取；同时覆盖 IPv4/IPv6。
  首个公网查询时解压并复用读取器，不请求外部查询服务，不把访问者 IP 发给第三方。
- `ipaddr.js` 统一处理 IPv4 映射地址及特殊用途地址。

### DSM HTTPS 入口

DSM → frontend → backend 有两段独立的信任边界。`TRUSTED_PROXY_CIDRS` 仍只信任 frontend，
另外用生产私有配置中的 `FRONTEND_TRUSTED_EDGE_PROXY` 指定 DSM 请求到达 frontend 时的
确切来源 IP/CIDR。默认仅信任回环地址，禁止设置为所有地址，不自动信任整个 Docker 私有网段。
Docker 网桥下 DSM 的来源可能是网桥网关，必须核对实际拓扑后设置，不能照抄猜测的地址。
这一生产配置需在另行授权的发布时应用，本地开发不修改 NAS。

frontend 使用 Nginx 官方 `real_ip` 模块，只接收可信上一跳的 `X-Forwarded-For`，
递归取最后一个不可信地址，再覆盖发往 backend 的来源 IP 头。DSM 必须追加或覆盖真实来源，
不能原样透传浏览器自填的头。未经配置时宁可不提示，也不能将 NAS 内网地址误报为境外出口。
参见 [Nginx real_ip 文档](https://nginx.org/en/docs/http/ngx_http_realip_module.html)。

## 数据维护和署名

本功能包含 MaxMind 创建的 GeoLite2 数据，来源：https://www.maxmind.com/ 。
数据由 [WP Statistics / VeronaLabs](https://github.com/wp-statistics/GeoLite2-Country)
通过 `geolite2-country` 分发；数据库遵循其上游 GeoLite2 条款和署名要求。
保留包内元数据：发布包的 license 字段标为 `CC-BY-NC-SA-4.0`，维护者 README 标为
`CC BY-SA 4.0`；再次分发或商业使用前须核对两者及上游授权，不能把数据当作本仓库 AGPL 源码重新授权。

数据库不是实时更新。维护应用版本时检查上游并更新锁定快照：

```bash
cd APP
npm install --workspace @sekerchat/backend --save-exact geolite2-country@latest
cd apps/backend
node --require ts-node/register --test src/network/network-status.test.ts src/network/network.controller.test.ts
```

数据库更新通过正常本地验证和另行授权的应用发布生效；不在生产容器里下载或修改数据。

## 本地验证

```bash
cd APP
npm run test --workspace @sekerchat/frontend-react -- src/components/workspace/NetworkReminder.test.tsx
npx playwright test tests/e2e/network-reminder.spec.ts tests/e2e/workspace.smoke.spec.ts
SEKERCHAT_PROXY_INTEGRATION=1 node --test scripts/network-proxy.integration.test.mjs
```

浏览器测试使用模拟数据，无需连接生产数据库或对象存储。
