import { SubscriptionAttachmentUsage, UploadKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class InitiateUploadDto {
  @IsEnum(UploadKind)
  kind!: UploadKind;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  postId?: string;

  @IsOptional()
  @IsEnum(SubscriptionAttachmentUsage)
  subscriptionUsage?: SubscriptionAttachmentUsage;

  @IsString()
  fileName!: string;

  @IsString()
  mimeType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  size!: number;
}
