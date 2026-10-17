namespace SekerChat.DesktopPet;

public sealed class WebClientNavigationState
{
    private string? _pendingUrl;
    private bool _pageReady;

    public bool ShouldNavigate(string webBaseUrl, string? currentUrl)
    {
        if (_pendingUrl is not null && WebBridgeScript.IsTrustedSource(webBaseUrl, _pendingUrl))
        {
            return false;
        }

        return !_pageReady || !WebBridgeScript.IsTrustedSource(webBaseUrl, currentUrl);
    }

    public void NavigationStarting(string? url)
    {
        _pendingUrl = url;
        _pageReady = false;
    }

    public void NavigationCompleted(bool isSuccess)
    {
        _pendingUrl = null;
        _pageReady = isSuccess;
    }

    public void ProcessFailed()
    {
        _pendingUrl = null;
        _pageReady = false;
    }
}
