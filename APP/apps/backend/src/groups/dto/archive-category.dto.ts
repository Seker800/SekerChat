import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ArchiveCategoryDto {
  @IsString()
  category = '';

  @IsOptional()
  @IsBoolean()
  archive?: boolean;
}
