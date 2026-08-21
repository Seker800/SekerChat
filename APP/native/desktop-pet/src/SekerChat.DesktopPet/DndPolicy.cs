namespace SekerChat.DesktopPet;

public static class DndPolicy
{
    public static bool IsActive(
        DateTimeOffset? dndUntil,
        DateTimeOffset? now = null) =>
        dndUntil is not null
        && dndUntil > (now ?? DateTimeOffset.UtcNow);
}
