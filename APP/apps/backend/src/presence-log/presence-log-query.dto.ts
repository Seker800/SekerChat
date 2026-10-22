import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListPresenceLogsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  offset?: number;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(['online', 'offline', 'dnd_on', 'dnd_off'])
  event?: string;
}
