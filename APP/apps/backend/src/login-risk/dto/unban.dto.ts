import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UnbanDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
