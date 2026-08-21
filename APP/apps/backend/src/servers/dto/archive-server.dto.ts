import { IsBoolean, IsOptional } from 'class-validator';

export class ArchiveServerDto {
  @IsBoolean()
  @IsOptional()
  archive?: boolean;
}
