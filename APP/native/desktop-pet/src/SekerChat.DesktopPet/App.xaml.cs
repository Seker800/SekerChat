using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows;
using Forms = System.Windows.Forms;

namespace SekerChat.DesktopPet;

public partial class App : System.Windows.Application
{
    private Mutex? _singleInstanceMutex;
    private EventWaitHandle? _activationEvent;
    private RegisteredWaitHandle? _activationRegistration;
    private Forms.NotifyIcon? _tray;
    private System.Drawing.Icon? _trayIcon;
    private DesktopPetMenu? _desktopPetMenu;
    private PetWindow? _petWindow;
    private SettingsWindow? _settingsWindow;
    private WebClientWindow? _webClient;

    public LocalStorage Storage { get; } = new();
    public AppState State { get; private set; } = null!;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        if (!AcquireSingleInstance())
        {
            Shutdown();
            return;
        }

        var hadWebViewData = Storage.HasWebViewData;
        State = new AppState(Storage);
        await State.InitializeAsync();

        _petWindow = new PetWindow(State);
        _webClient = new WebClientWindow(State, Storage);
        _webClient.Error += message =>
            Dispatcher.BeginInvoke(() =>
            {
                _tray?.ShowBalloonTip(
                    4000,
                    "SekerChat 软件版",
                    message,
                    Forms.ToolTipIcon.Warning);
            });
        _desktopPetMenu = new DesktopPetMenu(
            State,
            ShowWebClientAsync,
            OpenWebsiteInDefaultBrowser,
            () => _petWindow?.IsVisible == true,
            () => _petWindow?.Show(),
            () => _petWindow?.Hide(),
            ShowSettings,
            OpenDataDirectory,
            LogoutAsync,
            ExitAsync);
        CreateTray();
        WireEvents();
        _petWindow.Show();

        await _webClient.InitializeAsync(State.Settings.WebBaseUrl);
        var shouldShowWebClient = DesktopStartupPolicy.ShouldShowWebClient(hadWebViewData);
#if DEBUG
        shouldShowWebClient |= e.Args.Any(arg =>
            string.Equals(arg, "--show-client", StringComparison.OrdinalIgnoreCase));
#endif
        if (shouldShowWebClient)
        {
            await ShowWebClientAsync();
        }
    }

    public async Task ShowWebClientAsync()
    {
        if (_webClient is null)
        {
            return;
        }
        await _webClient.NavigateToWebsiteAsync(State.Settings.WebBaseUrl);
        _webClient.ShowClient();
    }

    public void OpenWebsiteInDefaultBrowser()
    {
        OpenUriInDefaultBrowser(new Uri(State.Settings.WebBaseUrl));
    }

    public void OpenConversationInDefaultBrowser(ConversationItem conversation)
    {
        var uri = MessagePolicy.BuildConversationUri(
            State.Settings.WebBaseUrl,
            conversation.GroupId,
            conversation.IsDM);
        OpenUriInDefaultBrowser(uri);
    }

    private static void OpenUriInDefaultBrowser(Uri uri)
    {
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri)
        {
            UseShellExecute = true,
        });
    }

    public void ShowSettings()
    {
        _settingsWindow ??= new SettingsWindow(State, ApplyWebBaseUrlAsync);
        _settingsWindow.LoadFromState();
        _settingsWindow.Show();
        _settingsWindow.Activate();
    }

    private Task ApplyWebBaseUrlAsync(string webBaseUrl) =>
        _webClient?.NavigateToWebsiteAsync(webBaseUrl) ?? Task.CompletedTask;

    public void OpenDataDirectory()
    {
        Directory.CreateDirectory(Storage.DirectoryPath);
        Process.Start(new ProcessStartInfo(Storage.DirectoryPath)
        {
            UseShellExecute = true,
        });
    }

    public void ShowDesktopPetMenu()
    {
        _desktopPetMenu?.ShowAtCursor();
    }

    public async Task LogoutAsync()
    {
        if (_webClient is not null)
        {
            await _webClient.LogoutAsync();
        }
    }

    public Task ExitAsync()
    {
        _webClient?.CloseForExit();
        _tray?.Dispose();
        _desktopPetMenu?.Dispose();
        _trayIcon?.Dispose();
        _activationRegistration?.Unregister(null);
        _activationEvent?.Dispose();
        _singleInstanceMutex?.Dispose();
        Shutdown();
        return Task.CompletedTask;
    }

    private bool AcquireSingleInstance()
    {
        const string mutexName = @"Local\SekerChatDesktopPet.SingleInstance";
        const string eventName = @"Local\SekerChatDesktopPet.Activate";
        _singleInstanceMutex = new Mutex(true, mutexName, out var created);
        if (!created)
        {
            try
            {
                EventWaitHandle.OpenExisting(eventName).Set();
            }
            catch
            {
            }
            return false;
        }

        _activationEvent = new EventWaitHandle(false, EventResetMode.AutoReset, eventName);
        _activationRegistration = ThreadPool.RegisterWaitForSingleObject(
            _activationEvent,
            (_, _) => Dispatcher.BeginInvoke(() =>
            {
                _petWindow?.Show();
                _petWindow?.Activate();
            }),
            null,
            Timeout.Infinite,
            executeOnlyOnce: false);
        return true;
    }

    private void WireEvents()
    {
        State.ConversationOpenRequested += conversation =>
            Dispatcher.BeginInvoke(() => _webClient?.ShowConversation(conversation));
        State.NotificationRequested += (conversation, important) =>
            Dispatcher.BeginInvoke(() =>
            {
                if (_tray is null)
                {
                    return;
                }
                _tray.BalloonTipClicked -= OpenLatestConversation;
                _tray.BalloonTipClicked += OpenLatestConversation;
                _tray.Tag = conversation;
                _tray.ShowBalloonTip(
                    important ? 6000 : 3000,
                    important ? $"重要消息 · {conversation.GroupName}" : conversation.GroupName,
                    $"{conversation.SenderName}：{conversation.Preview}",
                    important ? Forms.ToolTipIcon.Warning : Forms.ToolTipIcon.Info);
            });
    }

    private async void OpenLatestConversation(object? sender, EventArgs e)
    {
        if (_tray?.Tag is ConversationItem conversation)
        {
            await State.OpenConversationAsync(conversation);
        }
    }

    private void CreateTray()
    {
        _trayIcon = LoadApplicationIcon();
        _tray = new Forms.NotifyIcon
        {
            Icon = _trayIcon,
            Text = "SekerChat 桌面消息助手",
            Visible = true,
            ContextMenuStrip = _desktopPetMenu?.Menu,
        };
        _tray.DoubleClick += (_, _) => Dispatcher.Invoke(OpenWebsiteInDefaultBrowser);
    }

    private static System.Drawing.Icon LoadApplicationIcon()
    {
        var executablePath = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(executablePath))
        {
            var icon = System.Drawing.Icon.ExtractAssociatedIcon(executablePath);
            if (icon is not null)
            {
                return icon;
            }
        }

        return (System.Drawing.Icon)System.Drawing.SystemIcons.Application.Clone();
    }
}
