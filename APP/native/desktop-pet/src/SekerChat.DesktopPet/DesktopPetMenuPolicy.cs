namespace SekerChat.DesktopPet;

public static class DesktopPetMenuPolicy
{
    public static string PrimarySessionText(DesktopUser? _) => "打开软件版";

    public static string AccountStatusText(DesktopUser? user) =>
        user is null
            ? "状态：未登录"
            : $"已登录：{user.DisplayName ?? user.Email}";

    public static string LogoutText(DesktopUser? user) =>
        user is null
            ? "登录"
            : "退出当前账号 / 切换账号…";
}
