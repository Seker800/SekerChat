# Windows Desktop Pet

`APP/native/desktop-pet` 是 SekerChat 的 Windows 桌面宠物与内嵌网页客户端。

## 边界

- 使用 C#、.NET 10、WPF、Wpf.Ui 暗色 Fluent 外壳和 Microsoft Edge WebView2。
- 不属于 npm workspace，也不参与群晖 Docker 镜像构建。
- 直接加载现有 SekerChat 网站，不增加前端路由、后端接口或数据库表。
- Cookie、缓存和 DOM 存储保存在桌宠自己的 WebView2 用户数据目录。
- 原生层只负责桌宠、托盘、Windows 启动项、提示音和消息提醒。

## 核心流程

```text
桌宠配置现有网站地址
  -> WebView2 加载原有 SekerChat 网页
  -> 用户在内嵌网页中正常登录
  -> WebView2 自动持久化 Cookie
  -> 原有网页维持 /realtime WebSocket
  -> 页面脚本前注入的本地桥接转发 message.created
  -> 原生桌宠在正常、消息、勿扰、未登录状态间切换 CC0 像素鹅动画
  -> 右键桌宠打开统一菜单，需要时再展开内嵌网页
```

桥接只接受配置网站同源页面发来的 WebView2 消息，不读取密码，也不把 Cookie
复制到桌宠代码中。

## 本地数据

默认目录：

```text
%LocalAppData%\SekerChat\DesktopPet\
  settings.json
  WebView2\
```

`WebView2` 目录由 Microsoft Edge WebView2 管理，包含 Cookie、缓存和网站存储。
右键菜单“账号与连接”中的退出 / 切换账号操作会删除 WebView2 Cookie 和网页存储，
不影响用户在系统浏览器里的登录。

## 桌宠交互

- 左键点击：有新消息时用默认浏览器打开最近的未读会话；其他状态只播放点击反馈。
- 左键拖动：移动桌宠并播放拖拽状态动画，松手后贴边并记住位置。
- 右键：打开统一功能菜单；顶部“打开软件版”进入内嵌客户端，未登录时显示登录页面。
- 顶层“打开网页版”使用系统默认浏览器，方便直接进入完整网页版。
- “账号与连接”包含登录状态、退出 / 切换账号和服务器地址。
- “桌宠显示”“消息提醒”“系统”使用二级菜单收纳大小、置顶、穿透、勿扰、提示音、
  隐藏消息正文、开机启动和数据目录等功能。
- “打开软件版”使用内嵌 WebView2；“打开网页版”使用系统默认浏览器。
- 软件版使用深色 Fluent 标题栏，连接状态集中显示；后退、前进、刷新和隐藏到托盘收纳在“更多”菜单中。
- 正常、有消息、勿扰和未登录状态分别映射像素鹅的待机、行走、奔跑和拍翅动画。启动后 3—6 秒播放首个动作；
  每次只播放一轮，静止 18—35 秒后再轮换，避免持续动画干扰视线。
- 每种状态使用独立洗牌队列，一轮内会看完该状态的全部动作后再重新洗牌。
- 新配置默认使用 50% 大小；拖拽位移会按 Windows DPI 换算。
- 每种状态都有人工挑选的稳定休息姿势，动作完成后回到休息姿势，不使用动画末帧
  作为长期停留画面。
- “消息唤醒模式”默认开启，桌宠平时隐藏，仅在有消息且未开启勿扰时显示。桌宠与托盘
  共用同一个右键菜单，桌宠隐藏后仍可从托盘关闭该模式。
- 只有“有新消息”和“请先登录”会显示头顶气泡。
- 原始 CC0 spritesheet 不嵌入程序，运行时只包含切分、裁边后的 PNG 动画帧。

## 部署要求

这条路线不要求修改或重新部署 SekerChat frontend、backend、PostgreSQL 或 MinIO。
只需要分发新版 Windows 桌宠。目标电脑需要 Microsoft Edge WebView2 Runtime；
Windows 11 通常已经自带。

## 开发与发布

```powershell
cd APP
.\scripts\desktop-pet.ps1 build
.\scripts\desktop-pet.ps1 test
.\scripts\desktop-pet.ps1 run
.\scripts\desktop-pet.ps1 publish
```

当前发布输出自包含 `win-x64` 绿色产物。正式分发前仍需补充代码签名、WebView2
Runtime 缺失时的安装引导和自动更新通道。
