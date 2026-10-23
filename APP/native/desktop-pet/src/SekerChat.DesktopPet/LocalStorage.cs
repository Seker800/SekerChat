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

    private readonly SemaphoreSlim _settingsWriteLock = new(1, 1);
    private readonly string _directory;

    public LocalStorage(string? directory = null)
    {
        _directory = directory ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SekerChat", "DesktopPet");
    }
    private string SettingsPath => Path.Combine(_directory, "settings.json");

    public string DirectoryPath => _directory;
    public string WebViewDataPath => Path.Combine(_directory, "WebView2");
    public bool HasWebViewData => Directory.Exists(WebViewDataPath);

    public async Task<DesktopSettings> LoadSettingsAsync()
    {
        var settings = new DesktopSettings();
        try
        {
            var json = await File.ReadAllTextAsync(SettingsPath);
            settings = JsonSerializer.Deserialize<DesktopSettings>(json, JsonOptions) ?? settings;
            var migrated = DesktopSettings.Migrate(settings);
            if (migrated != settings)
            {
                await SaveSettingsAsync(migrated);
            }
            return migrated;
        }
        catch
        {
            return DesktopSettings.Migrate(settings);
        }
    }

    public async Task SaveSettingsAsync(DesktopSettings settings)
    {
        await _settingsWriteLock.WaitAsync();
        var temporaryPath = SettingsPath + ".tmp";
        try
        {
            Directory.CreateDirectory(_directory);
            await File.WriteAllTextAsync(temporaryPath, JsonSerializer.Serialize(settings, JsonOptions));
            File.Move(temporaryPath, SettingsPath, overwrite: true);
        }
        finally
        {
            try
            {
                if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
            }
            finally
            {
                _settingsWriteLock.Release();
            }
        }
    }
}
