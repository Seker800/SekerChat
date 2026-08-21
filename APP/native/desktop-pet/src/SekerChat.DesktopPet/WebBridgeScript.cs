using System.Text.Json;

namespace SekerChat.DesktopPet;

public static class WebBridgeScript
{
    private const string OriginPlaceholder = "\"__SEKERCHAT_ORIGIN__\"";

    public static string Build(string webBaseUrl)
    {
        var origin = GetOrigin(webBaseUrl);
        return ScriptTemplate.Replace(
            OriginPlaceholder,
            JsonSerializer.Serialize(origin),
            StringComparison.Ordinal);
    }

    public static bool IsTrustedSource(string webBaseUrl, string? source)
    {
        if (!Uri.TryCreate(source, UriKind.Absolute, out var sourceUri))
        {
            return false;
        }
        return string.Equals(
            GetOrigin(webBaseUrl),
            sourceUri.GetLeftPart(UriPartial.Authority),
            StringComparison.OrdinalIgnoreCase);
    }

    public static string NormalizeWebBaseUrl(string webBaseUrl)
    {
        if (
            !Uri.TryCreate(webBaseUrl.Trim(), UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
        {
            throw new InvalidOperationException("网页地址无效，请填写以 http:// 或 https:// 开头的完整地址。");
        }
        return uri.GetLeftPart(UriPartial.Authority).TrimEnd('/');
    }

    private static string GetOrigin(string webBaseUrl) =>
        new Uri(NormalizeWebBaseUrl(webBaseUrl)).GetLeftPart(UriPartial.Authority);

    private const string ScriptTemplate = """
        (() => {
          const expectedOrigin = "__SEKERCHAT_ORIGIN__";
          if (location.origin !== expectedOrigin || window.__sekerDesktopBridgeInstalled) return;
          window.__sekerDesktopBridgeInstalled = true;

          const post = (message) => {
            try {
              window.chrome.webview.postMessage(message);
            } catch {
              // The page also works normally when it is opened outside WebView2.
            }
          };

          let syncTimer = 0;
          const syncSession = async () => {
            window.clearTimeout(syncTimer);
            try {
              const userResponse = await fetch('/api/users/me', { credentials: 'include' });
              if (userResponse.status === 401 || userResponse.status === 403) {
                post({ kind: 'auth', authenticated: false });
                return;
              }
              if (!userResponse.ok) {
                throw new Error(`用户状态同步失败：HTTP ${userResponse.status}`);
              }

              const groupsResponse = await fetch('/api/groups', { credentials: 'include' });
              if (groupsResponse.status === 401 || groupsResponse.status === 403) {
                post({ kind: 'auth', authenticated: false });
                return;
              }
              if (!groupsResponse.ok) {
                throw new Error(`会话列表同步失败：HTTP ${groupsResponse.status}`);
              }

              const [user, groups] = await Promise.all([userResponse.json(), groupsResponse.json()]);
              post({ kind: 'snapshot', user, groups });
            } catch (error) {
              post({ kind: 'bridge_error', message: String(error) });
            }
          };
          const scheduleSync = (delay = 500) => {
            window.clearTimeout(syncTimer);
            syncTimer = window.setTimeout(syncSession, delay);
          };

          const NativeWebSocket = window.WebSocket;
          class SekerDesktopWebSocket extends NativeWebSocket {
            constructor(...args) {
              super(...args);
              this.addEventListener('open', () => {
                post({ kind: 'connection', connected: true });
                scheduleSync(100);
              });
              this.addEventListener('close', () => {
                post({ kind: 'connection', connected: false });
              });
              this.addEventListener('message', (messageEvent) => {
                try {
                  const data = JSON.parse(messageEvent.data);
                  if (data?.type === 'message.created') {
                    post({ kind: 'realtime_event', event: data });
                    scheduleSync(1200);
                  } else if (data?.type === 'group.updated') {
                    scheduleSync(400);
                  } else if (data?.type === 'presence.changed') {
                    post({
                      kind: 'presence',
                      userId: data.payload?.userId,
                      isDnd: Boolean(data.payload?.isDnd),
                    });
                  }
                } catch {
                  // Ignore non-JSON WebSocket messages.
                }
              });
            }
          }
          window.WebSocket = SekerDesktopWebSocket;

          window.addEventListener('load', () => scheduleSync(300));
          window.addEventListener('online', () => scheduleSync(100));
          window.setInterval(syncSession, 30000);
        })();
        """;
}
