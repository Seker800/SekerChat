namespace SekerChat.DesktopPet;

public static class MessagePolicy
{
    public static bool IsImportant(MessagePayload message, string currentUserId) =>
        message.MentionedUserIds.Contains(currentUserId) ||
        message.ReplyTo?.SenderId == currentUserId;

    public static Uri BuildConversationUri(string webBaseUrl, string groupId, bool isDM)
    {
        var route = isDM ? "dm" : "groups";
        return new Uri($"{webBaseUrl.Trim().TrimEnd('/')}/{route}/{Uri.EscapeDataString(groupId)}");
    }
}
