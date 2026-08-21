using System.IO;
using System.Text.Json;

namespace SekerChat.DesktopPet;

public sealed class LocalStorage
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true,
    };

    private readonly string _directory =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SekerChat", "DesktopPet");
    private string SettingsPath => Path.Combine(_directory, "settings.json");

    public string DirectoryPath => _directory;
    public string WebViewDataPath => Path.Combine(_directory, "WebView2");
    public bool HasWebViewData => Directory.Exists(WebViewDataPath);

    public async Task<DesktopSettings> LoadSettingsAsync()
    {
        try
        {
            var json = await File.ReadAllTextAsync(SettingsPath);
            return JsonSerializer.Deserialize<DesktopSettings>(json, JsonOptions) ?? new DesktopSettings();
        }
        catch
        {
            return new DesktopSettings();
        }
    }

    public async Task SaveSettingsAsync(DesktopSettings settings)
    {
        Directory.CreateDirectory(_directory);
        await File.WriteAllTextAsync(SettingsPath, JsonSerializer.Serialize(settings, JsonOptions));
    }
}
