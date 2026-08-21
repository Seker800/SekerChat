import { IsEmail, IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class VerifyReminderDeviceCodeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  deviceName!: string;
}
