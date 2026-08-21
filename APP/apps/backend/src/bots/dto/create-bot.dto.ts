import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export interface BotConfig {
  gatewayUrl?: string;
  authToken?: string;
  openclawAgentId?: string;
  allowedUserIds?: string[];
  chatEnabled?: boolean;
  systemPrompt?: string;
}

export const BOT_CONFIG_DEFAULTS = {
  gatewayUrl: 'http://127.0.0.1:18789',
  authToken: process.env.OPENCLAW_GATEWAY_AUTH_TOKEN || '',
  openclawAgentId: 'main',
  chatEnabled: true,
  systemPrompt: '',
} as const;

export function resolveBotConfig(raw: BotConfig | null | undefined): Required<BotConfig> {
  return {
    gatewayUrl: raw?.gatewayUrl || BOT_CONFIG_DEFAULTS.gatewayUrl,
    authToken: raw?.authToken || BOT_CONFIG_DEFAULTS.authToken,
    openclawAgentId: raw?.openclawAgentId || BOT_CONFIG_DEFAULTS.openclawAgentId,
    allowedUserIds: raw?.allowedUserIds ?? [],
    chatEnabled: raw?.chatEnabled ?? BOT_CONFIG_DEFAULTS.chatEnabled,
    systemPrompt: raw?.systemPrompt?.trim() || BOT_CONFIG_DEFAULTS.systemPrompt,
  };
}

export class CreateBotDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(100)
  displayName!: string;

  @IsOptional()
  botConfig?: BotConfig;
}
