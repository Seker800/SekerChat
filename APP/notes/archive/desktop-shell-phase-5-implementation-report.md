# 第5阶段 desktop-shell 实现报告

日期：2026-05-09

## 本轮交付

- 新建独立桌面壳 app：`APP/apps/desktop-shell`
- workspace 已接入 `@sekerchat/desktop-shell`
- 桌面壳固定为 `Electron + 远程 Web URL`
- 支持开发态本地 URL 与生产态远程 URL
- 增加本地 loading / error fallback 页面
- 增加单实例锁
- 增加绿色版 `userData` 路径策略
- 增加 `userData` 回退提示
- 增加导航限制 / 新窗口限制 / 权限白名单
- 增加最小壳版本检查状态
- 增加托盘菜单、关闭隐藏和最小通知桥接
- 增加 Windows portable 打包脚本
- 为 `frontend-react` 补最小 CSP 入口

## 关键文件

- `APP/apps/desktop-shell/package.json`
- `APP/apps/desktop-shell/src/electron-main.ts`
- `APP/apps/desktop-shell/src/preload.ts`
- `APP/apps/desktop-shell/src/desktop/index.html`
- `APP/apps/desktop-shell/src/desktop/renderer.js`
- `APP/apps/desktop-shell/src/desktop/styles.css`
- `APP/apps/frontend-react/index.html`
- `APP/apps/frontend-react/nginx.conf.template`
- `APP/package.json`

## 已验证

- `cd APP && npm run typecheck --workspace @sekerchat/desktop-shell`
- `cd APP && npm run build --workspace @sekerchat/desktop-shell`
- `cd APP && npm run build --workspace @sekerchat/frontend-react`
- `cd APP && npm run typecheck`
- `cd APP && npm run package:win-portable --workspace @sekerchat/desktop-shell`
- `cd APP && DESKTOP_WEB_DEV_URL=http://127.0.0.1:5173 npm run start:desktop --workspace @sekerchat/desktop-shell`

## 当前结果说明

- `desktop-shell` 已能独立构建
- workspace 级 `typecheck` 已跑通
- Windows portable 打包命令已进入真实打包流程，并开始生成 `release/win-x64-unpacked` 相关产物
- fallback 页现在会显示当前数据模式、回退警告和最小版本检查结果
- 本地 Electron 启动命令可拉起主进程；当前环境记录到 GPU 渲染告警，但未见桌面壳主进程崩溃
- 已补托盘菜单、关闭隐藏、托盘点击唤起/隐藏，以及受控通知桥接

## 本轮明确未做

- 不做安装版
- 不做自动更新
- 不做签名接入
- 不做托盘与通知完整产品体验
- 不做桌面专属第二套业务页面

## 剩余风险

- SmartScreen 仍需要后续签名与长期 reputation 建设，代码层无法直接消除
- 当前 CSP 为最小基线，后续若接入新域名、上传域名或更复杂脚本策略，需要和正式部署一起调整
- 当前桌面壳已具备最小托盘产品流，但未做未读数、消息聚合或更完整的通知策略
- 远程版本检查当前只支持读取 `DESKTOP_VERSION_URL` 指向的简单 JSON，例如 `{ "version": "0.5.1" }`
