import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RenameCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  from!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  to!: string;
}
