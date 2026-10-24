using System.Text.Json;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Resources;
using System.IO.Compression;
using SekerChat.DesktopPet;

var checks = 0;
void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
    checks++;
}

Check(!new DesktopSettings().MessageWakeMode, "New installs should show the pet");
var migrated = DesktopSettings.Migrate(new DesktopSettings { MessageWakeMode = true });
Check(!migrated.MessageWakeMode, "Upgrade should restore the visible pet once");
Check(migrated.SettingsVersion == DesktopSettings.CurrentSettingsVersion, "Migration must be versioned");
var optedIn = DesktopSettings.Migrate(migrated with { MessageWakeMode = true });
Check(optedIn.MessageWakeMode, "Later explicit preferences must survive restarts");
Check(migrated.WebBaseUrl == "http://localhost:5173", "Migration must preserve unrelated settings");
Check(PetStatePolicy.ShouldShowPet(migrated.MessageWakeMode, PetState.Normal, false), "Quiet pet should be visible");

var root = Path.Combine(Path.GetTempPath(), "seker-pet-tests-" + Guid.NewGuid());
Directory.CreateDirectory(root);
try
{
    var storage = new LocalStorage(Path.Combine(root, "settings"));
    var firstSettings = await storage.LoadSettingsAsync();
    Check(firstSettings.SettingsVersion == DesktopSettings.CurrentSettingsVersion, "First launch should use the current schema");
    Directory.CreateDirectory(storage.DirectoryPath);
    File.WriteAllText(Path.Combine(storage.DirectoryPath, "settings.json"), """{"MessageWakeMode":true,"WebBaseUrl":"https://chat.example.com","Left":42}""");
    var upgraded = await storage.LoadSettingsAsync();
    Check(!upgraded.MessageWakeMode && upgraded.Left == 42 && upgraded.WebBaseUrl == "https://chat.example.com", "Upgrade must preserve the connection and position");
    await storage.SaveSettingsAsync(upgraded with { MessageWakeMode = true });
    Check((await storage.LoadSettingsAsync()).MessageWakeMode, "The visibility migration should only run once");
    await Task.WhenAll(Enumerable.Range(0, 20).Select(index => storage.SaveSettingsAsync(upgraded with { Left = index })));
    Check((await storage.LoadSettingsAsync()).WebBaseUrl == "https://chat.example.com", "Concurrent writes must preserve a readable connection config");
    Check(!File.Exists(Path.Combine(storage.DirectoryPath, "settings.json.tmp")), "Successful writes must leave no temporary file");
    File.WriteAllText(Path.Combine(storage.DirectoryPath, "settings.json"), """{"WebBaseUrl":"https://chat.example.com"}""");
    Directory.CreateDirectory(Path.Combine(storage.DirectoryPath, "settings.json.tmp"));
    Check((await storage.LoadSettingsAsync()).WebBaseUrl == "https://chat.example.com", "Migration write failure must not reset the configured server");
    Directory.Delete(Path.Combine(storage.DirectoryPath, "settings.json.tmp"));
    Check(PetSkin.TryLoad(root) is null, "Missing skin should use public fallback");
    var states = Enum.GetValues<PetState>().ToDictionary(x => x.ToString(), _ => new[] { "idle" });
    var interactions = new Dictionary<string, string[]> { ["Dragging"] = ["idle"], ["Clicked"] = ["idle"] };
    void WriteSkin(string asset = "idle")
    {
        File.WriteAllText(Path.Combine(root, "skin.json"), JsonSerializer.Serialize(new
        {
            States = states.ToDictionary(x => x.Key, _ => new[] { asset }),
            Interactions = interactions,
            RestFrames = states.ToDictionary(x => x.Key, _ => new { AssetPath = "idle", FrameIndex = 0 }),
        }));
    }
    Directory.CreateDirectory(Path.Combine(root, "idle"));
    File.WriteAllText(Path.Combine(root, "idle", "animation.json"), "{\"Delays\":[100]}");
    // Loader validates files; image decoding belongs to the Windows rendering tests.
    File.WriteAllBytes(Path.Combine(root, "idle", "frame-000.png"), [1]);
    WriteSkin();
    var skin = PetSkin.TryLoad(root);
    Check(skin is not null, "Complete private skin should load");
    Check(skin!.ForState(PetState.Normal).Single() == Path.Combine(root, "idle"), "Private paths should resolve inside pack");
    Check(skin.ForInteraction(PetInteraction.Dragging).Count == 1, "Interaction should load");
    Check(skin.RestFor(PetState.Message).FrameIndex == 0, "Rest frame should load");
    var validManifest = File.ReadAllText(Path.Combine(root, "skin.json"));
    var archivePath = Path.Combine(root, "test-skin.zip");
    using (var archive = ZipFile.Open(archivePath, ZipArchiveMode.Create))
    {
        foreach (var file in new[] { "skin.json", "idle/animation.json", "idle/frame-000.png" })
            archive.CreateEntryFromFile(Path.Combine(root, file), file);
    }
    var cache = Path.Combine(root, "cache");
    string? cachedAssetPath = null;
    using (var stream = File.OpenRead(archivePath))
    {
        var bundled = BundledPetSkin.TryLoad(stream, cache);
        Check(bundled is not null, "Embedded skin should extract and load without a sidecar directory");
        Check(bundled!.ForState(PetState.Normal).Single().StartsWith(cache), "Embedded skin should use the app cache");
        cachedAssetPath = bundled.ForState(PetState.Normal).Single();
    }
    using (var stream = File.OpenRead(archivePath))
        Check(BundledPetSkin.TryLoad(stream, cache) is not null, "Restart should reuse the validated skin cache");
    File.Delete(Path.Combine(cachedAssetPath!, "frame-000.png"));
    using (var stream = File.OpenRead(archivePath))
        Check(BundledPetSkin.TryLoad(stream, cache) is not null, "Missing cached frame should be repaired from the embedded archive");
    Check(File.Exists(Path.Combine(cachedAssetPath!, "frame-000.png")), "Cache repair must restore the missing frame");
    using (var badArchive = new MemoryStream([1, 2, 3]))
        Check(BundledPetSkin.TryLoad(badArchive, cache) is null, "Broken embedded archive should fall back");
    var traversalArchive = Path.Combine(root, "traversal.zip");
    using (var archive = ZipFile.Open(traversalArchive, ZipArchiveMode.Create))
        using (var writer = new StreamWriter(archive.CreateEntry("../escaped.txt").Open())) writer.Write("blocked");
    using (var stream = File.OpenRead(traversalArchive))
        Check(BundledPetSkin.TryLoad(stream, cache) is null, "Zip traversal must be rejected");
    Check(!File.Exists(Path.Combine(cache, "escaped.txt")), "Extraction must stay within staging");
    Check(!Directory.EnumerateDirectories(cache, "*.tmp").Any(), "Failed extraction must remove its staging directory");
    foreach (var delays in new[] { "[]", "[0]", "[-1]", "[\"bad\"]", "[2147483648]" })
    {
        File.WriteAllText(Path.Combine(root, "idle", "animation.json"), "{\"Delays\":" + delays + "}");
        Check(PetSkin.TryLoad(root) is null, "Invalid delays must use public fallback: " + delays);
    }
    File.WriteAllText(Path.Combine(root, "idle", "animation.json"), "{\"Delays\":[100]}");
    File.WriteAllText(Path.Combine(root, "skin.json"), validManifest.Replace("\"FrameIndex\":0", "\"FrameIndex\":1"));
    Check(PetSkin.TryLoad(root) is null, "Out of bounds rest frame must reject the skin");
    File.WriteAllText(Path.Combine(root, "skin.json"), validManifest.Replace("\"Normal\":[\"idle\"]", "\"Normal\":[]"));
    Check(PetSkin.TryLoad(root) is null, "Empty state pool must reject the skin");
    File.WriteAllText(Path.Combine(root, "skin.json"), validManifest.Replace("\"Dragging\":[\"idle\"]", "\"Other\":[\"idle\"]"));
    Check(PetSkin.TryLoad(root) is null, "Missing interaction must reject the skin");
    WriteSkin("../outside");
    Check(PetSkin.TryLoad(root) is null, "Traversal must reject the whole skin");
    WriteSkin(Path.GetTempPath());
    Check(PetSkin.TryLoad(root) is null, "Absolute paths must reject the whole skin");
    WriteSkin();
    File.Delete(Path.Combine(root, "idle", "frame-000.png"));
    Check(PetSkin.TryLoad(root) is null, "Incomplete pack must use public fallback");
    File.WriteAllText(Path.Combine(root, "skin.json"), "broken");
    Check(PetSkin.TryLoad(root) is null, "Invalid manifest must use public fallback");
}
finally { Directory.Delete(root, recursive: true); }
if (args.Length >= 1)
{
    var skin = PetSkin.TryLoad(args[0]);
    Check(skin is not null, "Requested private skin must validate");
    Console.WriteLine($"PASS: private skin has {Enum.GetValues<PetState>().Sum(state => skin!.ForState(state).Count)} state animations");
}
if (args.Length >= 2)
{
    using var executable = new PEReader(File.OpenRead(args[1]));
    var metadata = executable.GetMetadataReader();
    var resources = executable.GetSectionData(executable.PEHeaders.CorHeader!.ResourcesDirectory.RelativeVirtualAddress);
    var assetKeys = new List<string>();
    byte[]? bundledSkin = null;
    foreach (var handle in metadata.ManifestResources)
    {
        var resource = metadata.GetManifestResource(handle);
        var resourceName = metadata.GetString(resource.Name);
        var reader = resources.GetReader((int)resource.Offset, resources.Length - (int)resource.Offset);
        var payload = reader.ReadBytes(reader.ReadInt32());
        if (resourceName == BundledPetSkin.ResourceName) bundledSkin = payload;
        if (!resourceName.EndsWith(".g.resources", StringComparison.Ordinal)) continue;
        using var entries = new ResourceReader(new MemoryStream(payload));
        foreach (System.Collections.DictionaryEntry entry in entries)
        {
            var key = (string)entry.Key;
            if (key.EndsWith(".png") || key.EndsWith("animation.json")) assetKeys.Add(key);
        }
    }
    Check(assetKeys.Count > 0, "Public assembly must contain fallback pet assets");
    Check(assetKeys.All(key => key.StartsWith("assets/pixelgoose/runtime/", StringComparison.Ordinal)), "Public assembly must embed only public pet assets");
    var expectPrivate = args.Length >= 3 && args[2] == "private";
    Check((bundledSkin is not null) == expectPrivate, "Private archive must only be present in explicit private builds");
    if (bundledSkin is not null)
    {
        var cache = Path.Combine(Path.GetTempPath(), "seker-embedded-audit-" + Guid.NewGuid());
        try
        {
            using var stream = new MemoryStream(bundledSkin);
            var actual = BundledPetSkin.TryLoad(stream, cache);
            var expected = PetSkin.TryLoad(args[0]);
            Check(actual is not null, "Actual embedded assembly resource must load without sidecar files");
            Check(Enum.GetValues<PetState>().All(state => actual!.ForState(state).Count == expected!.ForState(state).Count), "Embedded skin must preserve every state animation");
            Check(new[] { PetInteraction.Dragging, PetInteraction.Clicked }.All(interaction => actual!.ForInteraction(interaction).Count == expected!.ForInteraction(interaction).Count), "Embedded skin must preserve every interaction animation");
        }
        finally { if (Directory.Exists(cache)) Directory.Delete(cache, recursive: true); }
    }
    Console.WriteLine($"PASS: {assetKeys.Count} public animation resources contain only PixelGoose");
}
Console.WriteLine($"PASS: {checks} portable desktop-pet checks");
