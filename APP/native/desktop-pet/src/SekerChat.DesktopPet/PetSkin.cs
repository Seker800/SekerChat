using System.IO;
using System.Text.Json;

namespace SekerChat.DesktopPet;

// Optional data-only skin. Private assets never become assembly resources.
public sealed class PetSkin
{
    private readonly Dictionary<PetState, string[]> _states = [];
    private readonly Dictionary<PetInteraction, string[]> _interactions = [];
    private readonly Dictionary<PetState, PetRestFrame> _restFrames = [];

    public IReadOnlyList<string> ForState(PetState state) => _states[state];
    public IReadOnlyList<string> ForInteraction(PetInteraction interaction) => _interactions[interaction];
    public PetRestFrame RestFor(PetState state) => _restFrames[state];

    public static PetSkin? TryLoad(string directory)
    {
        try
        {
            var root = Path.GetFullPath(directory) + Path.DirectorySeparatorChar;
            using var document = JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "skin.json")));
            var manifest = document.RootElement;
            var frameCounts = new Dictionary<string, int>();
            string Resolve(string relative)
            {
                if (string.IsNullOrWhiteSpace(relative) || Path.IsPathRooted(relative))
                    throw new InvalidDataException("素材路径必须是资源包内的相对路径。");
                var path = Path.GetFullPath(Path.Combine(root, relative));
                if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("素材路径超出资源包。");
                if (!frameCounts.ContainsKey(path))
                {
                    using var animation = JsonDocument.Parse(File.ReadAllText(Path.Combine(path, "animation.json")));
                    var delays = animation.RootElement.GetProperty("Delays").EnumerateArray().ToArray();
                    if (delays.Length is < 1 or > 2000 || delays.Any(delay => delay.GetInt32() <= 0))
                        throw new InvalidDataException("动画帧时长无效。");
                    for (var index = 0; index < delays.Length; index++)
                        if (!File.Exists(Path.Combine(path, $"frame-{index:D3}.png")))
                            throw new InvalidDataException("动画缺少帧文件。");
                    frameCounts[path] = delays.Length;
                }
                return path;
            }
            string[] Pool(string section, string key)
            {
                var paths = manifest.GetProperty(section).GetProperty(key).EnumerateArray()
                    .Select(value => Resolve(value.GetString()!)).Distinct().ToArray();
                if (paths.Length == 0) throw new InvalidDataException("动画列表为空。");
                return paths;
            }
            var skin = new PetSkin();
            foreach (var state in Enum.GetValues<PetState>())
            {
                skin._states[state] = Pool("States", state.ToString());
                var rest = manifest.GetProperty("RestFrames").GetProperty(state.ToString());
                var path = Resolve(rest.GetProperty("AssetPath").GetString()!);
                var index = rest.GetProperty("FrameIndex").GetInt32();
                if (index < 0 || index >= frameCounts[path]) throw new InvalidDataException("休息帧超出范围。");
                skin._restFrames[state] = new PetRestFrame(path, index);
            }
            foreach (var interaction in new[] { PetInteraction.Dragging, PetInteraction.Clicked })
                skin._interactions[interaction] = Pool("Interactions", interaction.ToString());
            return skin;
        }
        catch (Exception exception) when (exception is IOException or InvalidDataException or UnauthorizedAccessException
            or JsonException or KeyNotFoundException or InvalidOperationException or ArgumentException
            or FormatException or OverflowException)
        {
            return null;
        }
    }
}
