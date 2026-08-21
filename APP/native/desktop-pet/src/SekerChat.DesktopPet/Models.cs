namespace SekerChat.DesktopPet;

public enum PetState
{
    Normal,
    Message,
    DoNotDisturb,
    NotLoggedIn,
}

public sealed record DesktopSettings
{
    public string WebBaseUrl { get; init; } = "http://localhost:5173";
    public bool AlwaysOnTop { get; init; } = true;
    public bool ClickThrough { get; init; }
    public bool MessageWakeMode { get; init; } = true;
    public bool HideMessageContent { get; init; } = true;
    public bool StartWithWindows { get; init; }
    public double PetScale { get; init; } = 0.5;
    public double? Left { get; init; }
    public double? Top { get; init; }
}

public sealed record DesktopUser
{
    public required string Id { get; init; }
    public required string Email { get; init; }
    public string? DisplayName { get; init; }
    public string Role { get; init; } = "MEMBER";
    public DateTimeOffset? DndUntil { get; init; }
}

public sealed record BrowserSessionSnapshot
{
    public required DesktopUser User { get; init; }
    public List<BrowserGroupSummary> Groups { get; init; } = [];
}

public sealed record BrowserGroupSummary
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public bool IsDM { get; init; }
    public int UnreadCount { get; init; }
    public DateTimeOffset UpdatedAt { get; init; }
}

public sealed record RealtimeEvent
{
    public string EventId { get; init; } = "0";
    public string Type { get; init; } = "";
    public required string GroupId { get; init; }
    public DateTimeOffset OccurredAt { get; init; }
    public MessagePayload Payload { get; init; } = new();
}

public sealed record MessagePayload
{
    public string Id { get; init; } = "";
    public string GroupId { get; init; } = "";
    public string SenderId { get; init; } = "";
    public string Type { get; init; } = "TEXT";
    public string? Text { get; init; }
    public List<string> MentionedUserIds { get; init; } = [];
    public MessageReply? ReplyTo { get; init; }
    public MessageSender Sender { get; init; } = new();
}

public sealed record MessageReply
{
    public required string SenderId { get; init; }
}

public sealed record MessageSender
{
    public string Id { get; init; } = "";
    public string? DisplayName { get; init; }
    public string Email { get; init; } = "";
}

public sealed record ConversationItem
{
    public required string GroupId { get; init; }
    public required string GroupName { get; set; }
    public bool IsDM { get; set; }
    public string SenderName { get; set; } = "";
    public string Preview { get; set; } = "发来一条新消息";
    public int UnreadCount { get; set; }
    public bool IsImportant { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
