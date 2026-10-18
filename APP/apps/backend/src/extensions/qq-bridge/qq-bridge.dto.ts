import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateConnectorDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
}
export class ToggleConnectorDto {
  @IsBoolean() enabled!: boolean;
}
export class BindingDto {
  @IsUUID() connectorId!: string;
  @IsUUID() groupId!: string;
  @IsString() @Matches(/^\d{1,20}$/) accountId!: string;
  @IsString() @Matches(/^\d{1,20}$/) qqGroupId!: string;
}
export class ToggleBindingDto {
  @IsBoolean() enabled!: boolean;
  @IsBoolean() bidirectional!: boolean;
  @IsIn(['keep-paused', 'resume', 'discard']) backlog!: 'keep-paused' | 'resume' | 'discard';
}
export class QqCatalogGroupDto {
  @IsString() @Matches(/^\d{1,20}$/) id!: string;
  @IsString() @MaxLength(120) name!: string;
}
export class HeartbeatDto {
  @IsBoolean() connected!: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => QqCatalogGroupDto)
  groups?: QqCatalogGroupDto[];
}
export class QqMessagePartDto {
  @IsIn(['text', 'image']) type!: 'text' | 'image';
  @IsOptional() @IsString() @MaxLength(10000) text?: string;
  @IsOptional() @IsUUID() fileId?: string;
}
export class IngestQqMessageDto {
  @IsUUID() bindingId!: string;
  @IsInt() @Min(1) @Max(2147483647) revision!: number;
  @IsString() @MaxLength(80) @Matches(/^[\w:-]+$/) messageId!: string;
  @IsString() @Matches(/^\d{1,20}$/) senderId!: string;
  @IsString() @MaxLength(120) displayName!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsUUID() avatarFileId?: string;
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[\w:-]+$/) replyToId?: string;
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => QqMessagePartDto)
  parts!: QqMessagePartDto[];
}
export class RevokeQqMessageDto {
  @IsUUID() bindingId!: string;
  @IsInt() @Min(1) revision!: number;
  @IsString() @MaxLength(80) @Matches(/^[\w:-]+$/) messageId!: string;
}
export class MediaUploadDto {
  @IsUUID() bindingId!: string;
  @Type(() => Number) @IsInt() @Min(1) revision!: number;
}
export class DeliveryLeaseDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) lease!: string;
}
export class FinishDeliveryDto extends DeliveryLeaseDto {
  @IsIn(['sent', 'uncertain', 'failed']) status!: 'sent' | 'uncertain' | 'failed';
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[\w:-]+$/) messageId?: string;
}
export class ResolveDeliveryDto {
  @IsIn(['sent', 'cancelled']) status!: 'sent' | 'cancelled';
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[\w:-]+$/) messageId?: string;
}
