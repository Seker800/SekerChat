import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CreateMessageType {
  TEXT = 'text',
  IMAGE = 'image',
  FILE = 'file',
}

class MessageAttachmentDto {
  @IsString()
  @IsNotEmpty()
  fileId!: string;
}

export class CreateMessageDto {
  @IsEnum(CreateMessageType)
  type!: CreateMessageType;

  @IsOptional()
  @IsUUID()
  clientMessageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  text?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MessageAttachmentDto)
  attachment?: MessageAttachmentDto;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  replyToMessageId?: string;
}
