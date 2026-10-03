import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(
    private readonly store: SystemConfigStoreService,
    private readonly prisma: PrismaService,
  ) {}

  async getRawConfig(): Promise<Record<string, string>> {
    return this.store.getValues([...ATTENDANCE_CONFIG_KEYS]);
  }

  async updateFromDto(dto: UpdateSystemConfigDto): Promise<void> {
    if (dto.attendanceTimezone !== undefined) {
      const conflictingSummary = await this.prisma.presenceDailySummary.findFirst({
        where: { timezone: { not: dto.attendanceTimezone } },
        select: { id: true },
      });
      if (conflictingSummary) {
        throw new BadRequestException(
          'Attendance timezone cannot change after historical presence has been compacted.',
        );
      }
    }
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
