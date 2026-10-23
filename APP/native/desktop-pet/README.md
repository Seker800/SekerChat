# SekerChat Desktop Pet

Windows 原生桌宠外壳，加上使用独立 Cookie 配置的 WebView2 网页客户端。

- [发布说明](RELEASE_NOTES.md)
- [使用说明](USER_GUIDE.md)
- [给用户看的简版说明](新版说明.txt)

## 当前能力

- WPF 透明 CC0 像素鹅桌宠窗口
- Wpf.Ui 深色 Fluent 软件窗口，与内嵌网页暗色界面保持一致
- 单实例、托盘、拖动、贴边和位置记忆
- 置顶、鼠标穿透、隐藏和开机启动
- WebView2 内嵌现有 SekerChat 网站
- 在桌宠内使用网站原有登录页面
- WebView2 用户数据目录长期保存 Cookie
- 直接复用网站原有 `/realtime` WebSocket
- 同源网页消息到原生桌宠的安全桥接
- 正常、有消息、勿扰和未登录四种状态
- 正常、新消息、拖拽和点击状态分别使用像素鹅的待机、行走、奔跑和拍翅动画
- 拖拽移动和左键点击拥有独立反馈动画
- 仅“有消息”和“未登录”在宠物头顶显示状态气泡
- 左键不打开功能窗口，所有操作集中在桌宠与托盘共用的右键菜单
- 顶层“打开软件版”进入内嵌客户端，未登录时显示登录页面
- 顶层“打开网页版”会直接打开系统浏览器中的完整网页版
- 右键通过“桌宠显示”“消息提醒”“系统”二级菜单收纳全部常用开关
- 连接设置窗口只管理服务器地址，不再重复右键菜单中的功能
- 启动后 3—6 秒播放首个动作；状态动画只播放一轮，随后静止 18—35 秒再轮换
- 每种状态使用独立洗牌队列，一轮内会看完该状态的全部表情后再重新洗牌
- 默认大小为 50%，高 DPI 屏幕下拖拽距离与鼠标保持一致
- 动作结束回到各状态专用休息姿势，不再停留在空白或扭曲末帧
- 有新消息时单击宠物，用默认浏览器直接打开最近的未读会话
- 默认常驻桌面；可选择开启“消息唤醒模式”
- 普通消息与提及/回复分级提醒
- 点击系统消息通知后在软件版中打开对应群组或私聊

桌宠不需要专用前端页面、后端 API、设备令牌或数据库迁移。

## 个人表情包与公开版本

维护同一套代码。公开构建只嵌入 CC0 像素鹅；个人版在 EXE 同级放置 `PetSkin/`，
启动时优先读取该数据包，缺失或清单无效则完整回退为像素鹅。
原始 GIF、派生帧、个人打包目录均应保存在仓库外，无需另建包含私有素材的 Git 分叉。

资源包使用 `skin.json`，包含 `States`、`Interactions`、`RestFrames`：

```json
{
  "States": {"Normal": ["idle"], "Message": ["idle"], "DoNotDisturb": ["idle"], "NotLoggedIn": ["idle"]},
  "Interactions": {"Dragging": ["idle"], "Clicked": ["idle"]},
  "RestFrames": {
    "Normal": {"AssetPath": "idle", "FrameIndex": 0},
    "Message": {"AssetPath": "idle", "FrameIndex": 0},
    "DoNotDisturb": {"AssetPath": "idle", "FrameIndex": 0},
    "NotLoggedIn": {"AssetPath": "idle", "FrameIndex": 0}
  }
}
```

每个动作目录包含 `animation.json`（如 `{"Delays":[100,100]}`，单位毫秒）和
`frame-000.png` 起的完整合成透明帧，沿用现有 PNG 动画播放器。
清单引用必须为包内相对路径；不能使用绝对路径或跨目录路径。

```powershell
cd APP
# 公开产物：artifacts/win-x64，不自动查找或复制本机私有素材。
.\scripts\desktop-pet.ps1 publish
# 个人产物：artifacts/private-win-x64；仅显式传入时复制资源包。
.\scripts\desktop-pet.ps1 publish -PrivateSkinDirectory 'D:\PersonalAssets\PetSkin'
```

两个产物目录分开；公开输出目录如果残留 `PetSkin` 会拒绝打包。
Git 忽略 `PetSkin/` 和桌宠构建产物；个人版必须连同整个 `PetSkin` 目录保存。
请勿把个人压缩包上传到公开 Release。

核心设置、升级迁移和私有素材校验也可在非 Windows 系统执行：

```sh
dotnet run --project native/desktop-pet/tests/SekerChat.DesktopPet.PortableTests
# 可选：追加资源包路径，校验实际的个人包。
```

## 开发

要求 Windows、.NET 10 SDK 和 Microsoft Edge WebView2 Runtime。

```powershell
cd APP\native\desktop-pet
dotnet build SekerChat.DesktopPet.slnx
dotnet run --project src\SekerChat.DesktopPet\SekerChat.DesktopPet.csproj
dotnet run --project tests\SekerChat.DesktopPet.CoreTests\SekerChat.DesktopPet.CoreTests.csproj
```

WebView2 SDK 使用稳定版 NuGet 包；运行时使用 Windows 上安装的 Evergreen Runtime。

## 像素鹅素材

桌宠使用 Duckhive 发布的 CC0 像素鹅素材包。原始 spritesheet 保存在：

```text
src/SekerChat.DesktopPet/Assets/PixelGoose/Source/
```

程序实际嵌入的是 `Assets/PixelGoose/Runtime/` 内切分、裁边后的透明 PNG 帧，
可从原始 spritesheet 重新生成：

```powershell
python tools\build-pixel-goose-assets.py
```

素材来源、许可证和下载哈希见
`src/SekerChat.DesktopPet/Assets/PixelGoose/SOURCES.md`。原作者将素材以 CC0 1.0
发布，允许公开安装包和公开仓库使用。

## 首次使用

1. 启动桌宠。
2. 软件版登录窗口会自动打开。
3. 直接在内嵌网页中正常登录。
4. 登录成功后可以隐藏网页窗口，桌宠仍会保持网页连接并接收消息。

如需更换服务器，右键桌宠并在“账号与连接”中选择“更改服务器地址”。

登录数据位于：

```text
%LocalAppData%\SekerChat\DesktopPet\WebView2
```

这个配置与 Chrome、Edge 浏览器的个人配置相互独立。

## 发布

```powershell
cd APP
.\scripts\desktop-pet.ps1 publish
```

产物输出到 `APP/native/desktop-pet/artifacts/win-x64/`。Release 版本不在任务栏显示
桌宠悬浮窗口，网页客户端窗口仍会正常显示在任务栏。
