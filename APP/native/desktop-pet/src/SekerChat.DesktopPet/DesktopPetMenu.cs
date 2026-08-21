using Forms = System.Windows.Forms;
using Drawing = System.Drawing;

namespace SekerChat.DesktopPet;

public sealed class DesktopPetMenu : IDisposable
{
    private readonly AppState _state;
    private readonly Func<Task> _showWebClient;
    private readonly Action _openWebsite;
    private readonly Func<bool> _isPetVisible;
    private readonly Action _showPet;
    private readonly Action _hidePet;
    private readonly Action _showConnectionSettings;
    private readonly Action _openDataDirectory;
    private readonly Func<Task> _logout;
    private readonly Func<Task> _exit;
    private readonly Forms.ToolStripMenuItem _primarySessionItem;
    private readonly Forms.ToolStripMenuItem _accountStatusItem;
    private readonly Forms.ToolStripMenuItem _logoutItem;
    private readonly Forms.ToolStripMenuItem _petVisibilityItem;
    private readonly Forms.ToolStripMenuItem _messageWakeItem;
    private readonly Forms.ToolStripMenuItem _startWithWindowsItem;
    private readonly Forms.ToolStripMenuItem _alwaysOnTopItem;
    private readonly Forms.ToolStripMenuItem _clickThroughItem;
    private readonly Forms.ToolStripMenuItem _hideMessageContentItem;
    private readonly Dictionary<double, Forms.ToolStripMenuItem> _sizeItems = [];

    public DesktopPetMenu(
        AppState state,
        Func<Task> showWebClient,
        Action openWebsite,
        Func<bool> isPetVisible,
        Action showPet,
        Action hidePet,
        Action showConnectionSettings,
        Action openDataDirectory,
        Func<Task> logout,
        Func<Task> exit)
    {
        _state = state;
        _showWebClient = showWebClient;
        _openWebsite = openWebsite;
        _isPetVisible = isPetVisible;
        _showPet = showPet;
        _hidePet = hidePet;
        _showConnectionSettings = showConnectionSettings;
        _openDataDirectory = openDataDirectory;
        _logout = logout;
        _exit = exit;

        Menu = new Forms.ContextMenuStrip
        {
            BackColor = Drawing.Color.FromArgb(32, 34, 37),
            ForeColor = Drawing.Color.FromArgb(242, 243, 245),
            Font = new Drawing.Font("Segoe UI", 10F),
            MinimumSize = new Drawing.Size(236, 0),
            Padding = new Forms.Padding(6),
            ShowCheckMargin = true,
            ShowImageMargin = false,
            Renderer = new DarkMenuRenderer(),
        };
        _primarySessionItem = new Forms.ToolStripMenuItem(
            DesktopPetMenuPolicy.PrimarySessionText(_state.CurrentUser))
        {
            Font = new Drawing.Font(Menu.Font, Drawing.FontStyle.Bold),
            ForeColor = Drawing.Color.FromArgb(122, 162, 247),
        };
        _primarySessionItem.Click += async (_, _) => await _showWebClient();
        Menu.Items.Add(_primarySessionItem);
        Menu.Items.Add(
            "打开网页版",
            null,
            (_, _) => _openWebsite());

        var accountMenu = new Forms.ToolStripMenuItem("账号与连接");
        _accountStatusItem = new Forms.ToolStripMenuItem
        {
            Enabled = false,
        };
        accountMenu.DropDownItems.Add(_accountStatusItem);
        accountMenu.DropDownItems.Add(new Forms.ToolStripSeparator());
        _logoutItem = new Forms.ToolStripMenuItem();
        _logoutItem.Click += async (_, _) => await _logout();
        accountMenu.DropDownItems.Add(_logoutItem);
        accountMenu.DropDownItems.Add(
            "更改服务器地址…",
            null,
            (_, _) => _showConnectionSettings());
        Menu.Items.Add(accountMenu);
        Menu.Items.Add(new Forms.ToolStripSeparator());

        _petVisibilityItem = new Forms.ToolStripMenuItem();
        _petVisibilityItem.Click += (_, _) =>
        {
            if (_isPetVisible())
            {
                _hidePet();
            }
            else
            {
                _showPet();
            }
        };
        Menu.Items.Add(_petVisibilityItem);

        var displayMenu = new Forms.ToolStripMenuItem("桌宠显示");
        var sizeMenu = new Forms.ToolStripMenuItem("宠物大小");
        foreach (var scale in PetScalePolicy.Presets)
        {
            var sizeItem = new Forms.ToolStripMenuItem($"{scale:P0}");
            sizeItem.Click += async (_, _) =>
                await _state.SaveSettingsAsync(_state.Settings with { PetScale = scale });
            _sizeItems.Add(scale, sizeItem);
            sizeMenu.DropDownItems.Add(sizeItem);
        }
        displayMenu.DropDownItems.Add(sizeMenu);

        _alwaysOnTopItem = new Forms.ToolStripMenuItem("始终置顶");
        _alwaysOnTopItem.Click += async (_, _) =>
            await ToggleSettingAsync(settings => settings with
            {
                AlwaysOnTop = !settings.AlwaysOnTop,
            });
        displayMenu.DropDownItems.Add(_alwaysOnTopItem);

        _clickThroughItem = new Forms.ToolStripMenuItem("鼠标穿透")
        {
            ToolTipText = "开启后可从系统托盘菜单关闭",
        };
        _clickThroughItem.Click += async (_, _) =>
            await ToggleSettingAsync(settings => settings with
            {
                ClickThrough = !settings.ClickThrough,
            });
        displayMenu.DropDownItems.Add(_clickThroughItem);
        Menu.Items.Add(displayMenu);

        var notificationMenu = new Forms.ToolStripMenuItem("消息提醒");

        _messageWakeItem = new Forms.ToolStripMenuItem("消息唤醒模式")
        {
            ToolTipText = "平时隐藏桌宠，仅在非勿扰状态收到消息时显示",
        };
        _messageWakeItem.Click += async (_, _) =>
            await ToggleSettingAsync(settings => settings with
            {
                MessageWakeMode = !settings.MessageWakeMode,
            });
        notificationMenu.DropDownItems.Add(_messageWakeItem);

        _hideMessageContentItem = new Forms.ToolStripMenuItem("隐藏通知中的消息正文");
        _hideMessageContentItem.Click += async (_, _) =>
            await ToggleSettingAsync(settings => settings with
            {
                HideMessageContent = !settings.HideMessageContent,
            });
        notificationMenu.DropDownItems.Add(_hideMessageContentItem);
        Menu.Items.Add(notificationMenu);

        var systemMenu = new Forms.ToolStripMenuItem("系统");
        _startWithWindowsItem = new Forms.ToolStripMenuItem("开机自动启动");
        _startWithWindowsItem.Click += async (_, _) =>
            await ToggleSettingAsync(settings => settings with
            {
                StartWithWindows = !settings.StartWithWindows,
            });
        systemMenu.DropDownItems.Add(_startWithWindowsItem);
        systemMenu.DropDownItems.Add(
            "打开桌宠数据目录",
            null,
            (_, _) => _openDataDirectory());
        Menu.Items.Add(systemMenu);

        Menu.Items.Add(new Forms.ToolStripSeparator());
        Menu.Items.Add(new Forms.ToolStripMenuItem($"版本 {AppVersion.Current}")
        {
            Enabled = false,
        });
        Menu.Items.Add("退出", null, async (_, _) => await _exit());
        ApplyDarkStyle(Menu);
        Menu.Opening += (_, _) => SyncFromState();
    }

    public Forms.ContextMenuStrip Menu { get; }

    public void ShowAtCursor()
    {
        SyncFromState();
        Menu.Show(Forms.Cursor.Position);
    }

    public void Dispose()
    {
        Menu.Dispose();
        GC.SuppressFinalize(this);
    }

    private void SyncFromState()
    {
        _primarySessionItem.Text =
            DesktopPetMenuPolicy.PrimarySessionText(_state.CurrentUser);
        _accountStatusItem.Text =
            DesktopPetMenuPolicy.AccountStatusText(_state.CurrentUser);
        _logoutItem.Text =
            DesktopPetMenuPolicy.LogoutText(_state.CurrentUser);
        _petVisibilityItem.Text = _isPetVisible() ? "隐藏桌宠" : "显示桌宠";
        _messageWakeItem.Checked = _state.Settings.MessageWakeMode;
        _startWithWindowsItem.Checked = _state.Settings.StartWithWindows;
        _alwaysOnTopItem.Checked = _state.Settings.AlwaysOnTop;
        _clickThroughItem.Checked = _state.Settings.ClickThrough;
        _hideMessageContentItem.Checked = _state.Settings.HideMessageContent;

        var currentScale = PetScalePolicy.Normalize(_state.Settings.PetScale);
        foreach (var (scale, item) in _sizeItems)
        {
            item.Checked = Math.Abs(currentScale - scale) < 0.01;
        }
    }

    private Task ToggleSettingAsync(Func<DesktopSettings, DesktopSettings> update) =>
        _state.SaveSettingsAsync(update(_state.Settings));

    private static void ApplyDarkStyle(Forms.ToolStrip menu)
    {
        menu.BackColor = Drawing.Color.FromArgb(32, 34, 37);
        menu.ForeColor = Drawing.Color.FromArgb(242, 243, 245);
        menu.Renderer = new DarkMenuRenderer();

        if (menu is Forms.ToolStripDropDownMenu dropDownMenu)
        {
            dropDownMenu.Padding = new Forms.Padding(6);
            dropDownMenu.ShowCheckMargin = true;
            dropDownMenu.ShowImageMargin = false;
        }

        foreach (Forms.ToolStripItem item in menu.Items)
        {
            item.Padding = item is Forms.ToolStripSeparator
                ? new Forms.Padding(0, 3, 0, 3)
                : new Forms.Padding(8, 5, 10, 5);

            if (item is Forms.ToolStripMenuItem menuItem
                && menuItem.DropDownItems.Count > 0)
            {
                ApplyDarkStyle(menuItem.DropDown);
            }
        }
    }
}
