import { SubscriptionPostStatus } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PinSubscriptionPostDto {
  @IsBoolean()
  pinned!: boolean;
}

export class ListSubscriptionPostsQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  manage?: string;

  @IsOptional()
  @IsIn(Object.values(SubscriptionPostStatus))
  status?: SubscriptionPostStatus;
}

export class CreateSubscriptionPostDto {
  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

}

export class UpdateSubscriptionPostDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100_000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[];

}
