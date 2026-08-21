import {
  DEFAULT_CHAT_ATTACHMENT_MAX_MB,
  MAX_CHAT_ATTACHMENT_MAX_MB,
  MAX_SUBSCRIPTION_ATTACHMENT_MAX_MB,
  MIN_CHAT_ATTACHMENT_MAX_MB,
  MIN_SUBSCRIPTION_ATTACHMENT_MAX_MB,
} from '@sekerchat/shared';
import { IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WorkStatusDefDto {
  @IsString()
  name!: string;

  @IsString()
  tone!: string;

  @IsString()
  textTone!: string;

  @IsOptional()
  @IsBoolean()
  isArchive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPackaging?: boolean;
}

export class UpdateSystemConfigDto {
  @IsOptional()
  @IsString()
  attendanceTimezone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  attendanceClockInStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  attendanceClockInEnd?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  attendanceClockOutStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  attendanceClockOutEnd?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([0-6](,[0-6])*)?$/, { message: 'must be comma-separated day numbers 0-6' })
  attendanceWorkDays?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  attendanceScheduledBreakMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  attendanceActiveWindowMinutes?: number;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  dndOn1?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  dndOff1?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  dndOn2?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  dndOff2?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([0-6](,[0-6])*)?$/, { message: 'must be comma-separated day numbers 0-6' })
  dndDaysOfWeek?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkStatusDefDto)
  workStatusDefs?: WorkStatusDefDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  messageRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  messageRetentionSizeGB?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  textRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  imageRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  imageRetentionSizeGB?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3650)
  fileRetentionDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  fileRetentionSizeGB?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_CHAT_ATTACHMENT_MAX_MB)
  @Max(MAX_CHAT_ATTACHMENT_MAX_MB)
  chatAttachmentMaxMB?: number;

  @IsOptional()
  @IsInt()
  @Min(MIN_SUBSCRIPTION_ATTACHMENT_MAX_MB)
  @Max(MAX_SUBSCRIPTION_ATTACHMENT_MAX_MB)
  subscriptionAttachmentMaxMB?: number;

  @IsOptional()
  @IsString()
  @Matches(/^(daily|weekly|manual)$/)
  retentionSchedule?: string;

  @IsOptional()
  @IsString()
  registrationOpen?: string;

  @IsOptional()
  @IsString()
  emailWhitelist?: string;

  @IsOptional()
  @IsObject()
  rolePermissions?: Record<string, string[]>;
}
