export type MessageGroup = {
  id: string;
  isDM: boolean;
  members: Array<{
    userId: string;
    user: {
      email: string;
      displayName: string | null;
      role: string;
      isBot: boolean;
    };
  }>;
};
