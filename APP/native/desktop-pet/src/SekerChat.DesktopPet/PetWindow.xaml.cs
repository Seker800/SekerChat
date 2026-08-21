using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;

namespace SekerChat.DesktopPet;

public partial class PetWindow : Window
{
    private const double BaseWidth = 220;
    private const double BaseHeight = 250;
    private const int GwlExStyle = -20;
    private const int WsExTransparent = 0x20;
    private readonly AppState _state;
    private readonly DispatcherTimer _frameTimer = new();
    private readonly DispatcherTimer _variationTimer = new()
    {
        Interval = TimeSpan.FromSeconds(40),
    };
    private readonly IReadOnlyDictionary<PetState, AssetShuffleBag> _stateAssetBags =
        Enum.GetValues<PetState>().ToDictionary(state => state, _ => new AssetShuffleBag());
    private readonly IReadOnlyDictionary<PetInteraction, AssetShuffleBag> _interactionAssetBags =
        new Dictionary<PetInteraction, AssetShuffleBag>
        {
            [PetInteraction.Dragging] = new(),
            [PetInteraction.Clicked] = new(),
        };
    private IReadOnlyList<BitmapFrame> _frames = [];
    private IReadOnlyList<TimeSpan> _frameDelays = [];
    private Action? _animationCompleted;
    private PetState? _renderedState;
    private PetInteraction _interaction;
    private int _frameIndex;
    private bool _loopAnimation;
    private bool _dragging;
    private bool _messageWakeModeWasEnabled;
    private double _appliedScale = 1.0;
    private System.Windows.Point _dragStart;
    private double _startLeft;
    private double _startTop;

    public PetWindow(AppState state)
    {
        InitializeComponent();
#if DEBUG
        ShowInTaskbar = true;
#endif
        _state = state;
        _messageWakeModeWasEnabled = state.Settings.MessageWakeMode;
        Topmost = state.Settings.AlwaysOnTop;
        Loaded += OnLoaded;
        SourceInitialized += (_, _) => ApplyClickThrough();
        _state.Changed += () => Dispatcher.BeginInvoke(UpdateVisualState);
        _frameTimer.Tick += OnFrameTick;
        _variationTimer.Tick += (_, _) =>
        {
            if (_interaction == PetInteraction.None && IsVisible)
            {
                PlayBaseVariation();
            }
            ScheduleNextVariation();
        };
        MouseLeftButtonDown += OnMouseLeftButtonDown;
        MouseLeftButtonUp += OnMouseLeftButtonUp;
        MouseMove += OnMouseMove;
        MouseRightButtonUp += ShowPetMenu;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        ApplyPetScale(anchorToBottomRight: false);
        var workArea = SystemParameters.WorkArea;
        Left = _state.Settings.Left is null
            ? workArea.Right - Width - 24
            : Math.Clamp(_state.Settings.Left.Value, workArea.Left, workArea.Right - Width);
        Top = _state.Settings.Top is null
            ? workArea.Bottom - Height - 24
            : Math.Clamp(_state.Settings.Top.Value, workArea.Top, workArea.Bottom - Height);
        UpdateVisualState();
        ScheduleNextVariation(playSoon: true);
        _variationTimer.Start();
    }

    private void OnMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ChangedButton != MouseButton.Left)
        {
            return;
        }

        _dragStart = PointToScreen(e.GetPosition(this));
        _startLeft = Left;
        _startTop = Top;
        _dragging = false;
        CaptureMouse();
        e.Handled = true;
    }

    private void OnMouseMove(object sender, System.Windows.Input.MouseEventArgs e)
    {
        if (e.LeftButton != MouseButtonState.Pressed || !IsMouseCaptured)
        {
            return;
        }

        var current = PointToScreen(e.GetPosition(this));
        var dpi = VisualTreeHelper.GetDpi(this);
        var deltaX = (current.X - _dragStart.X) / dpi.DpiScaleX;
        var deltaY = (current.Y - _dragStart.Y) / dpi.DpiScaleY;
        if (!_dragging && Math.Abs(deltaX) + Math.Abs(deltaY) > 8)
        {
            _dragging = true;
            PlayInteraction(PetInteraction.Dragging, loop: true);
        }

        if (_dragging)
        {
            Left = _startLeft + deltaX;
            Top = _startTop + deltaY;
        }
    }

    private async void OnMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        if (!IsMouseCaptured)
        {
            return;
        }

        ReleaseMouseCapture();
        if (_dragging)
        {
            SnapToWorkArea();
            await _state.SaveSettingsAsync(_state.Settings with { Left = Left, Top = Top });
            RestoreBaseState();
        }
        else
        {
            var latestUnread = _state.Conversations.FirstOrDefault();
            if (PetStatePolicy.ShouldOpenConversationOnClick(
                    _state.PetState,
                    latestUnread is not null))
            {
                ((App)System.Windows.Application.Current)
                    .OpenConversationInDefaultBrowser(latestUnread!);
            }
            else
            {
                PlayInteraction(PetInteraction.Clicked, loop: false);
            }
        }

        _dragging = false;
        e.Handled = true;
    }

    private void ShowPetMenu(object sender, MouseButtonEventArgs e)
    {
        ((App)System.Windows.Application.Current).ShowDesktopPetMenu();
        e.Handled = true;
    }

    private void UpdateVisualState()
    {
        Topmost = _state.Settings.AlwaysOnTop;
        ApplyPetScale(anchorToBottomRight: true);
        ApplyClickThrough();
        UpdateMessageWakeVisibility();
        if (_state.Settings.MessageWakeMode && !IsVisible)
        {
            _frameTimer.Stop();
            return;
        }

        switch (_state.PetState)
        {
            case PetState.Message:
                BubbleText.Text = "有新消息";
                StatusBubble.Visibility = Visibility.Visible;
                break;
            case PetState.NotLoggedIn:
                BubbleText.Text = "请先登录";
                StatusBubble.Visibility = Visibility.Visible;
                break;
            default:
                StatusBubble.Visibility = Visibility.Collapsed;
                break;
        }

        if (_interaction == PetInteraction.None && _renderedState != _state.PetState)
        {
            if (_renderedState is null)
            {
                ShowRestPose(_state.PetState);
            }
            else
            {
                PlayBaseVariation();
            }
        }
    }

    private void PlayBaseVariation()
    {
        var state = _state.PetState;
        _interaction = PetInteraction.None;
        _renderedState = state;
        PlayAsset(
            _stateAssetBags[state].Next(PetAssetCatalog.ForState(state)),
            loop: false,
            () => ShowRestPose(state));
    }

    private void PlayInteraction(PetInteraction interaction, bool loop)
    {
        _interaction = interaction;
        PlayAsset(
            _interactionAssetBags[interaction].Next(PetAssetCatalog.ForInteraction(interaction)),
            loop,
            loop ? null : RestoreBaseState);
    }

    private void PlayAsset(string assetPath, bool loop, Action? completed = null)
    {
        try
        {
            var manifest = ReadAnimationManifest(assetPath);
            _frames = Enumerable.Range(0, manifest.Delays.Count)
                .Select(index => LoadFrame($"{assetPath}/frame-{index:D3}.png"))
                .ToArray();
            _frameDelays = manifest.Delays
                .Select(delay => TimeSpan.FromMilliseconds(Math.Max(40, delay)))
                .ToArray();
            _frameIndex = 0;
            _loopAnimation = loop;
            _animationCompleted = completed;
            PetImage.Source = _frames[0];
            ScheduleNextFrame();
        }
        catch
        {
            _frameTimer.Stop();
            PetImage.Source = null;
        }
    }

    private void OnFrameTick(object? sender, EventArgs e)
    {
        _frameTimer.Stop();
        _frameIndex++;
        if (_frameIndex >= _frames.Count)
        {
            if (!_loopAnimation)
            {
                var completed = _animationCompleted;
                _animationCompleted = null;
                completed?.Invoke();
                return;
            }

            _frameIndex = 0;
        }

        PetImage.Source = _frames[_frameIndex];
        ScheduleNextFrame();
    }

    private void ScheduleNextFrame()
    {
        _frameTimer.Stop();
        _frameTimer.Interval = _frameDelays[_frameIndex];
        _frameTimer.Start();
    }

    private static AnimationManifest ReadAnimationManifest(string assetPath)
    {
        using var stream = OpenResource($"{assetPath}/animation.json");
        return JsonSerializer.Deserialize<AnimationManifest>(stream)
            ?? throw new InvalidOperationException($"桌宠动画清单无效：{assetPath}");
    }

    private static BitmapFrame LoadFrame(string path)
    {
        using var stream = OpenResource(path);
        var image = new BitmapImage();
        image.BeginInit();
        image.CacheOption = BitmapCacheOption.OnLoad;
        image.StreamSource = stream;
        image.EndInit();
        image.Freeze();
        return BitmapFrame.Create(image);
    }

    private static Stream OpenResource(string path)
    {
        var uri = new Uri(
            $"/SekerChat.DesktopPet;component/{path}",
            UriKind.Relative);
        return System.Windows.Application.GetResourceStream(uri)?.Stream
            ?? throw new InvalidOperationException($"找不到桌宠素材：{path}");
    }

    private void RestoreBaseState()
    {
        _interaction = PetInteraction.None;
        ShowRestPose(_state.PetState);
    }

    private void ShowRestPose(PetState state)
    {
        if (_interaction != PetInteraction.None || state != _state.PetState)
        {
            return;
        }

        _frameTimer.Stop();
        _animationCompleted = null;
        _renderedState = state;
        var rest = PetAssetCatalog.RestFor(state);
        PetImage.Source = LoadFrame(
            $"{rest.AssetPath}/frame-{rest.FrameIndex:D3}.png");
    }

    private void ScheduleNextVariation(bool playSoon = false)
    {
        _variationTimer.Interval = TimeSpan.FromSeconds(
            playSoon ? Random.Shared.Next(3, 7) : Random.Shared.Next(18, 36));
    }

    private void UpdateMessageWakeVisibility()
    {
        var enabled = _state.Settings.MessageWakeMode;
        var shouldShow = PetStatePolicy.ShouldShowPet(
            enabled,
            _state.PetState,
            _state.IsDoNotDisturb);

        if (enabled)
        {
            if (shouldShow && !IsVisible)
            {
                Show();
            }
            else if (!shouldShow && IsVisible)
            {
                Hide();
            }
        }
        else if (_messageWakeModeWasEnabled && !IsVisible)
        {
            Show();
        }

        _messageWakeModeWasEnabled = enabled;
    }

    private void ApplyPetScale(bool anchorToBottomRight)
    {
        var scale = PetScalePolicy.Normalize(_state.Settings.PetScale);
        if (Math.Abs(scale - _appliedScale) < 0.001
            && Math.Abs(Width - BaseWidth * scale) < 0.1)
        {
            return;
        }

        var right = Left + Width;
        var bottom = Top + Height;
        Width = BaseWidth * scale;
        Height = BaseHeight * scale;
        _appliedScale = scale;
        if (anchorToBottomRight && IsLoaded)
        {
            Left = right - Width;
            Top = bottom - Height;
            SnapToWorkArea();
        }
    }

    private void SnapToWorkArea()
    {
        var area = SystemParameters.WorkArea;
        Left = Math.Clamp(Left, area.Left, area.Right - Width);
        Top = Math.Clamp(Top, area.Top, area.Bottom - Height);
        const double snap = 24;
        if (Math.Abs(Left - area.Left) < snap) Left = area.Left;
        if (Math.Abs((Left + Width) - area.Right) < snap) Left = area.Right - Width;
        if (Math.Abs(Top - area.Top) < snap) Top = area.Top;
        if (Math.Abs((Top + Height) - area.Bottom) < snap) Top = area.Bottom - Height;
    }

    private void ApplyClickThrough()
    {
        var handle = new WindowInteropHelper(this).Handle;
        if (handle == nint.Zero)
        {
            return;
        }

        var style = GetWindowLong(handle, GwlExStyle);
        SetWindowLong(
            handle,
            GwlExStyle,
            _state.Settings.ClickThrough ? style | WsExTransparent : style & ~WsExTransparent);
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        e.Cancel = true;
        Hide();
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int GetWindowLong(nint window, int index);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern int SetWindowLong(nint window, int index, int value);

    private sealed record AnimationManifest(List<int> Delays);
}
