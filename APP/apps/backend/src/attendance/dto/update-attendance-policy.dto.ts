import { IsEnum } from 'class-validator';
import { AttendanceMode } from '@prisma/client';

export class UpdateAttendancePolicyDto {
  @IsEnum(AttendanceMode)
  mode!: AttendanceMode;
}

