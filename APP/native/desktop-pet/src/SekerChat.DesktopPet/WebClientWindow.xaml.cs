using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Wpf.Ui.Controls;

namespace SekerChat.DesktopPet;

public partial class WebClientWindow : FluentWindow
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly AppState _state;
    private readonly LocalStorage _storage;
    private bool _initialized;
    private bool _allowClose;
    private bool _bootstrapHidden;
    private string _webBaseUrl = "";
    private string? _bridgeScriptId;

    public event Action<string>? Error;

    public WebClientWindow(AppState state, LocalStorage storage)
    {
        InitializeComponent();
        _state = state;
        _storage = storage;
        Browser.DefaultBackgroundColor = System.Drawing.Color.FromArgb(255, 30, 31, 34);
#if DEBUG
        ShowInTaskbar = true;
#endif
    }

    public async Task InitializeAsync(string webBaseUrl)
    {
        _webBaseUrl = WebBridgeScript.NormalizeWebBaseUrl(webBaseUrl);
        if (!_initialized)
        {
            await BootstrapWindowHandleAsync();
            try
            {
                Directory.CreateDirectory(_storage.WebViewDataPath);
                var environment = await CoreWebView2Environment.CreateAsync(
                    browserExecutableFolder: null,
                    userDataFolder: _storage.WebViewDataPath);
                await Browser.EnsureCoreWebView2Async(environment);
                ConfigureBrowser();
                _initialized = true;
            }
            catch (WebView2RuntimeNotFoundException)
            {
                const string message = "这台电脑缺少 Microsoft Edge WebView2 Runtime，请安装后重新启动桌宠。";
                LoadingHint.Text = message;
                Error?.Invoke(message);
                return;
            }
            catch (Exception exception)
            {
                LoadingHint.Text = exception.Message;
                Error?.Invoke(exception.Message);
                return;
            }
            finally
            {
                FinishHiddenBootstrap();
            }
        }

        await ConfigureBridgeAsync();
        Browser.CoreWebView2.Navigate(_webBaseUrl);
    }

    public async Task NavigateToWebsiteAsync(string webBaseUrl)
    {
        var normalized = WebBridgeScript.NormalizeWebBaseUrl(webBaseUrl);
        if (!_initialized)
        {
            await InitializeAsync(normalized);
            return;
        }
        if (!string.Equals(_webBaseUrl, normalized, StringComparison.OrdinalIgnoreCase))
        {
            _webBaseUrl = normalized;
            await ConfigureBridgeAsync();
        }
        Browser.CoreWebView2.Navigate(_webBaseUrl);
    }

    public void ShowClient()
    {
        PositionOnScreen();
        ShowInTaskbar = true;
        Opacity = 1;
        Show();
        WindowState = WindowState.Normal;
        Activate();
    }

    public void ShowConversation(ConversationItem conversation)
    {
        var uri = MessagePolicy.BuildConversationUri(
            _webBaseUrl,
            conversation.GroupId,
            conversation.IsDM);
        Browser.CoreWebView2?.Navigate(uri.AbsoluteUri);
        ShowClient();
    }

    public async Task LogoutAsync()
    {
        if (!_initialized || Browser.CoreWebView2 is null)
        {
            _state.ClearBrowserSession();
            return;
        }

        Browser.CoreWebView2.CookieManager.DeleteAllCookies();
        try
        {
            await Browser.ExecuteScriptAsync(
                "try { localStorage.clear(); sessionStorage.clear(); } catch {}");
        }
        catch
        {
        }
        _state.ClearBrowserSession();
        Browser.CoreWebView2.Navigate(_webBaseUrl);
        ShowClient();
    }

    public void CloseForExit()
    {
        _allowClose = true;
        Close();
    }

    private async Task BootstrapWindowHandleAsync()
    {
        if (IsVisible)
        {
            return;
        }
        _bootstrapHidden = true;
        ShowActivated = false;
        ShowInTaskbar = false;
        Opacity = 0;
        Left = -32000;
        Top = -32000;
        Show();
        await Dispatcher.InvokeAsync(() => { }, DispatcherPriority.Loaded);
    }

    private void FinishHiddenBootstrap()
    {
        if (!_bootstrapHidden)
        {
            return;
        }
        _bootstrapHidden = false;
        Hide();
        Opacity = 1;
        ShowActivated = true;
    }

    private void ConfigureBrowser()
    {
        var core = Browser.CoreWebView2;
        core.Settings.AreDevToolsEnabled =
#if DEBUG
            true;
#else
            false;
#endif
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = true;
        core.WebMessageReceived += OnWebMessageReceived;
        core.NavigationCompleted += (_, args) =>
        {
            LoadingOverlay.Visibility = Visibility.Collapsed;
            BackMenuItem.IsEnabled = core.CanGoBack;
            ForwardMenuItem.IsEnabled = core.CanGoForward;
            if (!args.IsSuccess)
            {
                Error?.Invoke($"网页加载失败：{args.WebErrorStatus}");
            }
        };
        core.NewWindowRequested += (sender, args) =>
        {
            args.Handled = true;
            if (Uri.TryCreate(args.Uri, UriKind.Absolute, out _))
            {
                core.Navigate(args.Uri);
                ShowClient();
            }
        };
        core.ProcessFailed += (_, args) =>
            Error?.Invoke($"WebView2 进程异常：{args.ProcessFailedKind}");
    }

    private async Task ConfigureBridgeAsync()
    {
        var core = Browser.CoreWebView2;
        if (_bridgeScriptId is not null)
        {
            core.RemoveScriptToExecuteOnDocumentCreated(_bridgeScriptId);
        }
        _bridgeScriptId = await core.AddScriptToExecuteOnDocumentCreatedAsync(
            WebBridgeScript.Build(_webBaseUrl));
    }

    private void OnWebMessageReceived(
        object? sender,
        CoreWebView2WebMessageReceivedEventArgs args)
    {
        if (!WebBridgeScript.IsTrustedSource(_webBaseUrl, args.Source))
        {
            return;
        }

        try
        {
            using var document = JsonDocument.Parse(args.WebMessageAsJson);
            var root = document.RootElement;
            var kind = root.GetProperty("kind").GetString();
            switch (kind)
            {
                case "snapshot":
                    var snapshot = new BrowserSessionSnapshot
                    {
                        User = root.GetProperty("user").Deserialize<DesktopUser>(JsonOptions)
                            ?? throw new JsonException("缺少用户信息。"),
                        Groups = root.GetProperty("groups")
                            .Deserialize<List<BrowserGroupSummary>>(JsonOptions) ?? [],
                    };
                    _state.ApplyBrowserSnapshot(snapshot);
                    SetConnectionStatus(
                        $"已登录：{snapshot.User.DisplayName ?? snapshot.User.Email}",
                        true);
                    break;
                case "realtime_event":
                    var item = root.GetProperty("event").Deserialize<RealtimeEvent>(JsonOptions);
                    if (item is not null)
                    {
                        _ = _state.HandleEventAsync(item);
                    }
                    break;
                case "connection":
                    var connected = root.GetProperty("connected").GetBoolean();
                    _state.SetConnected(connected);
                    SetConnectionStatus(connected ? "消息已连接" : "等待连接", connected);
                    break;
                case "presence":
                    var userId = root.GetProperty("userId").GetString();
                    if (!string.IsNullOrWhiteSpace(userId))
                    {
                        _state.ApplyPresenceChanged(
                            userId,
                            root.GetProperty("isDnd").GetBoolean());
                    }
                    break;
                case "auth":
                    if (!root.GetProperty("authenticated").GetBoolean())
                    {
                        _state.MarkAuthenticationExpired();
                        SetConnectionStatus("请先登录", false);
                    }
                    break;
                case "bridge_error":
                    Error?.Invoke(root.GetProperty("message").GetString() ?? "网页桥接异常");
                    break;
            }
        }
        catch (Exception exception)
        {
            Error?.Invoke($"无法读取网页消息：{exception.Message}");
        }
    }

    private void PositionOnScreen()
    {
        var area = SystemParameters.WorkArea;
        if (
            Left < area.Left
            || Left > area.Right - 120
            || Top < area.Top
            || Top > area.Bottom - 80)
        {
            Left = area.Left + Math.Max(0, (area.Width - Width) / 2);
            Top = area.Top + Math.Max(0, (area.Height - Height) / 2);
        }
    }

    private void Back_Click(object sender, RoutedEventArgs e)
    {
        if (Browser.CoreWebView2?.CanGoBack == true)
        {
            Browser.CoreWebView2.GoBack();
        }
    }

    private void Forward_Click(object sender, RoutedEventArgs e)
    {
        if (Browser.CoreWebView2?.CanGoForward == true)
        {
            Browser.CoreWebView2.GoForward();
        }
    }

    private void Refresh_Click(object sender, RoutedEventArgs e) =>
        Browser.CoreWebView2?.Reload();

    private void More_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement { ContextMenu: { } menu } target)
        {
            return;
        }
        menu.PlacementTarget = target;
        menu.Placement = PlacementMode.Bottom;
        menu.IsOpen = true;
    }

    private void Hide_Click(object sender, RoutedEventArgs e) => Hide();

    private void SetConnectionStatus(string text, bool connected)
    {
        ConnectionText.Text = text;
        ConnectionDot.Background = new SolidColorBrush(
            connected
                ? System.Windows.Media.Color.FromRgb(59, 165, 93)
                : System.Windows.Media.Color.FromRgb(240, 178, 50));
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        if (_allowClose)
        {
            return;
        }
        e.Cancel = true;
        Hide();
    }
}
