import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class EditMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  text!: string;
}
