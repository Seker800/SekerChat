using System.Windows;
using Wpf.Ui.Controls;

namespace SekerChat.DesktopPet;

public partial class SettingsWindow : FluentWindow
{
    private readonly AppState _state;
    private readonly Func<string, Task> _applyWebBaseUrl;

    public SettingsWindow(AppState state, Func<string, Task> applyWebBaseUrl)
    {
        InitializeComponent();
        _state = state;
        _applyWebBaseUrl = applyWebBaseUrl;
    }

    public void LoadFromState()
    {
        var settings = _state.Settings;
        WebBaseUrlBox.Text = settings.WebBaseUrl;
        StatusText.Visibility = Visibility.Collapsed;
    }

    private async void Save_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            await SaveCurrentSettingsAsync();
            Hide();
        }
        catch (Exception exception)
        {
            StatusText.Text = exception.Message;
            StatusText.Visibility = Visibility.Visible;
        }
    }

    private async Task SaveCurrentSettingsAsync()
    {
        var normalized = WebBridgeScript.NormalizeWebBaseUrl(WebBaseUrlBox.Text);
        await _state.SaveSettingsAsync(_state.Settings with
        {
            WebBaseUrl = normalized,
        });
        await _applyWebBaseUrl(normalized);
        WebBaseUrlBox.Text = normalized;
    }

    protected override void OnClosing(System.ComponentModel.CancelEventArgs e)
    {
        e.Cancel = true;
        Hide();
    }
}
