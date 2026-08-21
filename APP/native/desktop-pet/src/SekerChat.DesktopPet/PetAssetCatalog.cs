namespace SekerChat.DesktopPet;

public enum PetInteraction
{
    None,
    Dragging,
    Clicked,
}

public sealed record PetRestFrame(string AssetPath, int FrameIndex);

public static class PetAssetCatalog
{
    private const string Root = "Assets/PixelGoose/Runtime/";

    private static readonly IReadOnlyDictionary<PetState, string[]> StateAssets =
        new Dictionary<PetState, string[]>
        {
            [PetState.Normal] =
            [
                Root + "Idle",
                Root + "Walk",
            ],
            [PetState.Message] =
            [
                Root + "Flap",
            ],
            [PetState.DoNotDisturb] =
            [
                Root + "Idle",
            ],
            [PetState.NotLoggedIn] =
            [
                Root + "Idle",
            ],
        };

    private static readonly IReadOnlyDictionary<PetInteraction, string[]> InteractionAssets =
        new Dictionary<PetInteraction, string[]>
        {
            [PetInteraction.Dragging] =
            [
                Root + "Run",
            ],
            [PetInteraction.Clicked] =
            [
                Root + "Flap",
            ],
        };

    private static readonly IReadOnlyDictionary<PetState, PetRestFrame> RestFrames =
        new Dictionary<PetState, PetRestFrame>
        {
            [PetState.Normal] = new(Root + "Idle", 0),
            [PetState.Message] = new(Root + "Flap", 0),
            [PetState.DoNotDisturb] = new(Root + "Idle", 1),
            [PetState.NotLoggedIn] = new(Root + "Idle", 0),
        };

    public static IReadOnlyList<string> ForState(PetState state) => StateAssets[state];

    public static IReadOnlyList<string> ForInteraction(PetInteraction interaction) =>
        InteractionAssets[interaction];

    public static PetRestFrame RestFor(PetState state) => RestFrames[state];
}
