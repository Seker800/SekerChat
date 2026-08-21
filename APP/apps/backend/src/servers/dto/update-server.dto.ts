import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateServerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  name = '';
}
