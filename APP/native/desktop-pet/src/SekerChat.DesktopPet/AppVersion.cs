using System.Reflection;

namespace SekerChat.DesktopPet;

public static class AppVersion
{
    public static string Current =>
        typeof(AppVersion).Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion
            .Split('+')[0]
        ?? "未知";
}
