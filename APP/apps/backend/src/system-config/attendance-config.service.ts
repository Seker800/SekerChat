import { Injectable } from '@nestjs/common';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigStoreService } from './system-config-store.service';

const ATTENDANCE_CONFIG_KEYS = [
  'attendanceTimezone',
  'attendanceClockInStart',
  'attendanceClockInEnd',
  'attendanceClockOutStart',
  'attendanceClockOutEnd',
  'attendanceWorkDays',
  'attendanceScheduledBreakMinutes',
  'attendanceActiveWindowMinutes',
] as const;

@Injectable()
export class AttendanceConfigService {
  constructor(private readonly store: SystemConfigStoreService) {}

  async getRawConfig(): Promise<Record<string, string>> {
    return this.store.getValues([...ATTENDANCE_CONFIG_KEYS]);
  }

  async updateFromDto(dto: UpdateSystemConfigDto): Promise<void> {
    await this.store.upsertMany({
      attendanceTimezone: dto.attendanceTimezone,
      attendanceClockInStart: dto.attendanceClockInStart,
      attendanceClockInEnd: dto.attendanceClockInEnd,
      attendanceClockOutStart: dto.attendanceClockOutStart,
      attendanceClockOutEnd: dto.attendanceClockOutEnd,
      attendanceWorkDays: dto.attendanceWorkDays,
      attendanceScheduledBreakMinutes:
        dto.attendanceScheduledBreakMinutes !== undefined
          ? String(dto.attendanceScheduledBreakMinutes)
          : undefined,
      attendanceActiveWindowMinutes:
        dto.attendanceActiveWindowMinutes !== undefined
          ? String(dto.attendanceActiveWindowMinutes)
          : undefined,
    });
  }
}
