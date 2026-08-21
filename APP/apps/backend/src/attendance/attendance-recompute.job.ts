import { Injectable } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

@Injectable()
export class AttendanceRecomputeJob {
  constructor(private readonly attendance: AttendanceService) {}

  recomputeRecent(): Promise<void> {
    return this.attendance.recomputeRecentDays();
  }

  recomputeAll(): Promise<void> {
    return this.attendance.recomputeAllUsers();
  }
}
