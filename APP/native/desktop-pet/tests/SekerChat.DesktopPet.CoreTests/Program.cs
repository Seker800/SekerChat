using SekerChat.DesktopPet;
using System.Text.Json;
using Forms = System.Windows.Forms;

var failures = new List<string>();

Check(
    MessagePolicy.IsImportant(
        new MessagePayload { MentionedUserIds = ["user-1"] },
        "user-1"),
    "mention should be important");

Check(
    MessagePolicy.IsImportant(
        new MessagePayload { ReplyTo = new MessageReply { SenderId = "user-1" } },
        "user-1"),
    "reply should be important");

Check(
    !MessagePolicy.IsImportant(
        new MessagePayload { MentionedUserIds = ["user-2"] },
        "user-1"),
    "ordinary message should not be important");

Check(
    MessagePolicy.BuildConversationUri("https://chat.example.com/", "group/1", false).AbsoluteUri ==
    "https://chat.example.com/groups/group%2F1",
    "group deep link should escape the group id");

Check(
    MessagePolicy.BuildConversationUri("https://chat.example.com/", "dm-1", true).AbsoluteUri ==
    "https://chat.example.com/dm/dm-1",
    "direct-message deep link should use the dm route");

Check(
    WebBridgeScript.NormalizeWebBaseUrl("https://chat.example.com/path/") ==
    "https://chat.example.com",
    "web client should normalize to the website origin");

Check(
    WebBridgeScript.IsTrustedSource(
        "https://chat.example.com",
        "https://chat.example.com/groups/one"),
    "bridge should accept the configured website origin");

Check(
    !WebBridgeScript.IsTrustedSource(
        "https://chat.example.com",
        "https://other.example.com/groups/one"),
    "bridge should reject another website origin");

Check(
    WebBridgeScript.Build("https://chat.example.com").Contains(
        "presence.changed",
        StringComparison.Ordinal),
    "bridge should forward realtime do-not-disturb changes");

Check(
    PetStatePolicy.Compute(false, false, false) == PetState.NotLoggedIn,
    "a missing web session should show the logged-out pet state");

Check(
    PetStatePolicy.Compute(true, true, true) == PetState.DoNotDisturb,
    "server do-not-disturb should take priority over unread messages");

Check(
    PetStatePolicy.Compute(true, false, true) == PetState.DoNotDisturb,
    "do-not-disturb should have its own pet state");

Check(
    PetStatePolicy.Compute(true, false, false) == PetState.Normal,
    "a signed-in quiet session should show the normal pet state");

var expiredSessionState = new AppState(new LocalStorage());
expiredSessionState.ApplyBrowserSnapshot(new BrowserSessionSnapshot
{
    User = new DesktopUser
    {
        Id = "expired-user",
        Email = "expired@example.com",
    },
});
expiredSessionState.MarkAuthenticationExpired();
Check(
    expiredSessionState.CurrentUser is null
    && !expiredSessionState.IsConnected
    && expiredSessionState.PetState == PetState.NotLoggedIn,
    "an expired web session should not leave the pet looking online");

Check(
    PetScalePolicy.Normalize(double.NaN) == 0.5,
    "an invalid saved pet scale should return to the default size");

Check(
    new DesktopSettings().PetScale == 0.5,
    "the default pet size should be 50 percent");

Check(
    new DesktopSettings().MessageWakeMode,
    "the desktop pet should stay hidden by default until a message arrives");

Check(
    new DesktopSettings().WebBaseUrl == "http://localhost:5173",
    "desktop-pet should use a neutral local SekerChat address by default");

Check(
    DesktopStartupPolicy.ShouldShowWebClient(hadWebViewData: false)
    && !DesktopStartupPolicy.ShouldShowWebClient(hadWebViewData: true),
    "desktop-pet should open the login client only on first launch");

var defaultSettingsJson = JsonSerializer.Serialize(new DesktopSettings());
Check(
    defaultSettingsJson.Contains("\"Left\":null", StringComparison.Ordinal)
    && defaultSettingsJson.Contains("\"Top\":null", StringComparison.Ordinal),
    "default desktop settings should serialize unset coordinates as standard JSON null values");

var savedPositionSettings = JsonSerializer.Deserialize<DesktopSettings>(
    """{"Left":1239,"Top":727}""");
Check(
    savedPositionSettings?.Left == 1239
    && savedPositionSettings.Top == 727
    && savedPositionSettings.MessageWakeMode,
    "desktop settings should load saved coordinates and apply new defaults to missing fields");

var dndNow = DateTimeOffset.Parse("2026-07-25T00:00:00Z");
Check(
    DndPolicy.IsActive(dndNow.AddMinutes(1), dndNow)
    && !DndPolicy.IsActive(dndNow.AddMinutes(-1), dndNow)
    && !DndPolicy.IsActive(null, dndNow),
    "desktop-pet should derive do-not-disturb from the server deadline");

var dndState = new AppState(new LocalStorage());
var dndUser = new DesktopUser
{
    Id = "dnd-user",
    Email = "dnd@example.com",
    DndUntil = DateTimeOffset.MaxValue,
};
dndState.ApplyBrowserSnapshot(new BrowserSessionSnapshot
{
    User = dndUser,
});
Check(
    dndState.IsDoNotDisturb
    && dndState.PetState == PetState.DoNotDisturb,
    "browser snapshots should apply the server do-not-disturb state");
dndState.ApplyPresenceChanged(dndUser.Id, false);
Check(
    !dndState.IsDoNotDisturb
    && dndState.PetState == PetState.Normal,
    "presence changes should update do-not-disturb immediately");

Check(
    PetScalePolicy.Normalize(0.1) == 0.25
    && PetScalePolicy.Normalize(3.0) == 1.5,
    "pet scale should stay inside the supported size range");

Check(
    Enum.GetValues<PetState>().All(state =>
        PetAssetCatalog.RestFor(state).FrameIndex >= 0),
    "every pet state should have an explicit stable rest frame");

Check(
    PetAssetCatalog.ForState(PetState.Normal).Count == 2
    && PetAssetCatalog.ForState(PetState.Message).Single().EndsWith("Flap", StringComparison.Ordinal)
    && PetAssetCatalog.ForInteraction(PetInteraction.Dragging).Single().EndsWith("Run", StringComparison.Ordinal),
    "pixel goose animations should map to the expected desktop-pet states");

var shuffleBag = new AssetShuffleBag(new Random(1234));
string[] shufflePool = ["one", "two", "three", "four"];
var firstShuffleCycle = Enumerable.Range(0, shufflePool.Length)
    .Select(_ => shuffleBag.Next(shufflePool))
    .ToArray();
var secondShuffleCycleFirst = shuffleBag.Next(shufflePool);
Check(
    firstShuffleCycle.Distinct().Count() == shufflePool.Length
    && secondShuffleCycleFirst != firstShuffleCycle[^1],
    "asset shuffle bag should exhaust a pool before repeating");

var menuUser = new DesktopUser
{
    Id = "user-1",
    Email = "person@example.com",
    DisplayName = "像素鹅",
};
Check(
    DesktopPetMenuPolicy.PrimarySessionText(null) == "打开软件版"
    && DesktopPetMenuPolicy.PrimarySessionText(menuUser) == "打开软件版"
    && DesktopPetMenuPolicy.AccountStatusText(menuUser).Contains("像素鹅", StringComparison.Ordinal)
    && DesktopPetMenuPolicy.LogoutText(null) == "登录"
    && DesktopPetMenuPolicy.LogoutText(menuUser).Contains("切换账号", StringComparison.Ordinal),
    "desktop-pet menu should expose the software edition and account state");

using (var menu = new DesktopPetMenu(
           new AppState(new LocalStorage()),
           () => Task.CompletedTask,
           () => { },
           () => true,
           () => { },
           () => { },
           () => { },
           () => { },
           () => Task.CompletedTask,
           () => Task.CompletedTask))
{
    var topLevelLabels = menu.Menu.Items
        .OfType<Forms.ToolStripMenuItem>()
        .Select(item => item.Text ?? string.Empty)
        .ToArray();
    Check(
        topLevelLabels.Contains("打开软件版")
        && topLevelLabels.Contains("打开网页版")
        && topLevelLabels.Contains($"版本 {AppVersion.Current}")
        && topLevelLabels.Contains("账号与连接")
        && topLevelLabels.Contains("桌宠显示")
        && topLevelLabels.Contains("消息提醒")
        && topLevelLabels.Contains("系统")
        && !topLevelLabels.Contains("设置"),
        "desktop-pet menu should group controls without a duplicate settings entry");
}

Check(
    AppVersion.Current == "0.5.9",
    "desktop-pet should expose its release version");

Check(
    PetStatePolicy.ShouldOpenConversationOnClick(PetState.Message, true)
    && !PetStatePolicy.ShouldOpenConversationOnClick(PetState.Normal, true)
    && !PetStatePolicy.ShouldOpenConversationOnClick(PetState.Message, false),
    "pet clicks should open a conversation only when a message is available");

Check(
    PetStatePolicy.ShouldShowPet(false, PetState.Normal, false)
    && PetStatePolicy.ShouldShowPet(true, PetState.Message, false)
    && !PetStatePolicy.ShouldShowPet(true, PetState.Normal, false)
    && !PetStatePolicy.ShouldShowPet(true, PetState.Message, true),
    "message wake mode should show the pet only for messages outside do-not-disturb");

var bridgeScript = WebBridgeScript.Build("https://chat.example.com");
Check(
    bridgeScript.Contains("message.created", StringComparison.Ordinal)
    && bridgeScript.Contains("window.chrome.webview.postMessage", StringComparison.Ordinal)
    && bridgeScript.Contains("https://chat.example.com", StringComparison.Ordinal)
    && bridgeScript.Contains("userResponse.status === 401", StringComparison.Ordinal)
    && bridgeScript.Contains("groupsResponse.status === 403", StringComparison.Ordinal),
    "bridge script should forward realtime messages and distinguish expired authentication");

if (failures.Count > 0)
{
    foreach (var failure in failures)
    {
        Console.Error.WriteLine($"FAIL: {failure}");
    }
    return 1;
}

Console.WriteLine("PASS: 25 desktop-pet core checks");
return 0;

void Check(bool condition, string description)
{
    if (!condition)
    {
        failures.Add(description);
    }
}
