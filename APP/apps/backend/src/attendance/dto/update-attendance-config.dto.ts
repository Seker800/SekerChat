import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateAttendanceConfigDto {
  @IsOptional()
  @IsString()
  attendanceTimezone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  attendanceClockInStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  attendanceClockInEnd?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  attendanceClockOutStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\d{2}:\d{2})?$/, { message: 'must be HH:mm or empty' })
  attendanceClockOutEnd?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([0-6](,[0-6])*)?$/, { message: 'must be comma-separated day numbers 0-6' })
  attendanceWorkDays?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(720)
  attendanceScheduledBreakMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  attendanceActiveWindowMinutes?: number;
}
