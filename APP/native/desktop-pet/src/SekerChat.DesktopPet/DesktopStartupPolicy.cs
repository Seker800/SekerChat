namespace SekerChat.DesktopPet;

public static class DesktopStartupPolicy
{
    public static bool ShouldShowWebClient(bool hadWebViewData) => !hadWebViewData;
}
