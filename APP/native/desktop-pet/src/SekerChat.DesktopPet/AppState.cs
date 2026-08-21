using System.Collections.ObjectModel;
using System.Media;

namespace SekerChat.DesktopPet;

public sealed class AppState
{
    private readonly LocalStorage _storage;
    private readonly Dictionary<string, ConversationItem> _conversations = [];
    private readonly Dictionary<string, BrowserGroupSummary> _groups = [];

    public ObservableCollection<ConversationItem> Conversations { get; } = [];
    public DesktopSettings Settings { get; private set; } = new();
    public DesktopUser? CurrentUser { get; private set; }
    public PetState PetState { get; private set; } = PetState.NotLoggedIn;
    public int TotalUnread => Conversations.Sum(item => item.UnreadCount);
    public bool IsConnected { get; private set; }
    public bool IsDoNotDisturb { get; private set; }

    public event Action? Changed;
    public event Action<ConversationItem, bool>? NotificationRequested;
    public event Action<ConversationItem>? ConversationOpenRequested;

    public AppState(LocalStorage storage)
    {
        _storage = storage;
    }

    public async Task InitializeAsync()
    {
        Settings = await _storage.LoadSettingsAsync();
        Changed?.Invoke();
    }

    public void ApplyBrowserSnapshot(BrowserSessionSnapshot snapshot)
    {
        CurrentUser = snapshot.User;
        IsDoNotDisturb = DndPolicy.IsActive(snapshot.User.DndUntil);
        IsConnected = true;
        _groups.Clear();

        var unreadIds = new HashSet<string>();
        foreach (var group in snapshot.Groups.OrderBy(group => group.UpdatedAt))
        {
            _groups[group.Id] = group;
            if (group.UnreadCount <= 0)
            {
                continue;
            }

            unreadIds.Add(group.Id);
            var conversation = _conversations.GetValueOrDefault(group.Id) ?? new ConversationItem
            {
                GroupId = group.Id,
                GroupName = group.Name,
                IsDM = group.IsDM,
                UpdatedAt = group.UpdatedAt,
            };
            conversation.GroupName = group.Name;
            conversation.IsDM = group.IsDM;
            conversation.UnreadCount = group.UnreadCount;
            conversation.UpdatedAt = group.UpdatedAt;
            AddOrUpdate(conversation);
        }

        foreach (var conversation in Conversations.Where(item => !unreadIds.Contains(item.GroupId)).ToList())
        {
            _conversations.Remove(conversation.GroupId);
            Conversations.Remove(conversation);
        }
        RecomputeState();
    }

    public void SetConnected(bool connected)
    {
        IsConnected = connected;
        RecomputeState();
    }

    public void ApplyPresenceChanged(string userId, bool isDoNotDisturb)
    {
        if (CurrentUser?.Id != userId)
        {
            return;
        }

        IsDoNotDisturb = isDoNotDisturb;
        RecomputeState();
    }

    public async Task HandleEventAsync(RealtimeEvent item)
    {
        if (CurrentUser is null || item.Payload.SenderId == CurrentUser.Id)
        {
            return;
        }

        var important = MessagePolicy.IsImportant(item.Payload, CurrentUser.Id);
        var group = _groups.GetValueOrDefault(item.GroupId);
        var existing = _conversations.GetValueOrDefault(item.GroupId);
        var conversation = existing ?? new ConversationItem
        {
            GroupId = item.GroupId,
            GroupName = group?.Name ?? item.GroupId,
            IsDM = group?.IsDM == true,
            UpdatedAt = item.OccurredAt,
        };
        conversation.SenderName = item.Payload.Sender.DisplayName
            ?? item.Payload.Sender.Email
            ?? conversation.GroupName;
        conversation.Preview = Settings.HideMessageContent
            ? "发来一条新消息"
            : BuildPreview(item.Payload);
        conversation.UnreadCount++;
        conversation.IsImportant |= important;
        conversation.UpdatedAt = item.OccurredAt;
        AddOrUpdate(conversation);
        RecomputeState();

        if (!IsDoNotDisturb)
        {
            (important ? SystemSounds.Exclamation : SystemSounds.Asterisk).Play();
            NotificationRequested?.Invoke(conversation, important);
        }
        await Task.CompletedTask;
    }

    public Task OpenConversationAsync(ConversationItem conversation)
    {
        conversation.UnreadCount = 0;
        conversation.IsImportant = false;
        _conversations.Remove(conversation.GroupId);
        Conversations.Remove(conversation);
        RecomputeState();
        ConversationOpenRequested?.Invoke(conversation);
        return Task.CompletedTask;
    }

    public async Task SaveSettingsAsync(DesktopSettings settings)
    {
        Settings = settings;
        await _storage.SaveSettingsAsync(settings);
        StartupManager.SetEnabled(settings.StartWithWindows);
        RecomputeState();
    }

    public void ClearBrowserSession()
    {
        CurrentUser = null;
        _groups.Clear();
        _conversations.Clear();
        Conversations.Clear();
        IsConnected = false;
        IsDoNotDisturb = false;
        RecomputeState();
    }

    public void MarkAuthenticationExpired()
    {
        ClearBrowserSession();
    }

    private void AddOrUpdate(ConversationItem conversation)
    {
        if (!_conversations.ContainsKey(conversation.GroupId))
        {
            _conversations[conversation.GroupId] = conversation;
            Conversations.Insert(0, conversation);
        }
        else
        {
            Conversations.Remove(conversation);
            Conversations.Insert(0, conversation);
        }
    }

    private void RecomputeState()
    {
        PetState = PetStatePolicy.Compute(
            CurrentUser is not null,
            TotalUnread > 0,
            IsDoNotDisturb);
        Changed?.Invoke();
    }

    private static string BuildPreview(MessagePayload payload)
    {
        if (payload.Type.Equals("TEXT", StringComparison.OrdinalIgnoreCase))
        {
            var text = payload.Text?.Trim() ?? "发来一条新消息";
            return text.Length > 80 ? $"{text[..80]}…" : text;
        }
        return payload.Type.Equals("IMAGE", StringComparison.OrdinalIgnoreCase)
            ? "发来一张图片"
            : "发来一个文件";
    }
}
