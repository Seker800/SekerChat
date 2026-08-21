import { IsBoolean, IsOptional } from 'class-validator';

export class ArchiveGroupDto {
  @IsOptional()
  @IsBoolean()
  archive?: boolean;
}
