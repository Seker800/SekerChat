namespace SekerChat.DesktopPet;

public static class PetStatePolicy
{
    public static PetState Compute(bool isLoggedIn, bool hasMessages, bool doNotDisturb)
    {
        if (!isLoggedIn)
        {
            return PetState.NotLoggedIn;
        }

        if (doNotDisturb)
        {
            return PetState.DoNotDisturb;
        }

        if (hasMessages)
        {
            return PetState.Message;
        }

        return PetState.Normal;
    }

    public static bool ShouldOpenConversationOnClick(
        PetState state,
        bool hasUnreadConversation) =>
        state == PetState.Message && hasUnreadConversation;

    public static bool ShouldShowPet(
        bool messageWakeMode,
        PetState state,
        bool doNotDisturb) =>
        !messageWakeMode || (state == PetState.Message && !doNotDisturb);
}
