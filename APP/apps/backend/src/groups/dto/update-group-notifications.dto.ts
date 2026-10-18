import { IsBoolean } from 'class-validator';

export class UpdateGroupNotificationsDto {
  @IsBoolean()
  notificationsMuted!: boolean;
}
