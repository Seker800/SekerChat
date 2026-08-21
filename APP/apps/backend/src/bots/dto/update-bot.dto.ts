import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { BotConfig } from './create-bot.dto';

export class UpdateBotDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  botConfig?: BotConfig;
}
