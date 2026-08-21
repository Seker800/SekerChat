import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetGroupWorkStateDto {
  @IsString()
  @MaxLength(50)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sourceMessageIds?: string[];
}
