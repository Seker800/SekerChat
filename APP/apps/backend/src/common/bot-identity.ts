export interface BotIdentityLike {
  role: string;
  isBot: boolean;
}

export interface BotConfigLike {
  chatEnabled?: boolean | null;
}

export function isAgentBot(user: BotIdentityLike | null | undefined): boolean {
  return Boolean(user && user.role === 'CLI_BOT' && user.isBot);
}

export function resolveActorType(user: BotIdentityLike | null | undefined): 'AGENT_BOT' | 'CLI_BOT' | 'HUMAN' {
  if (!user) return 'HUMAN';
  if (isAgentBot(user)) return 'AGENT_BOT';
  if (user.role === 'CLI_BOT') return 'CLI_BOT';
  return 'HUMAN';
}

export function canTriggerBotReply(
  user: BotIdentityLike | null | undefined,
  botConfig: BotConfigLike | null | undefined,
): boolean {
  return isAgentBot(user) && (botConfig?.chatEnabled ?? true);
}
