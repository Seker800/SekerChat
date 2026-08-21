import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReminderDeviceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  deviceName!: string;
}
