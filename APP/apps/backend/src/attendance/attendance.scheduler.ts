import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttendanceRecomputeJob } from './attendance-recompute.job';

@Injectable()
export class AttendanceScheduler {
  private readonly logger = new Logger(AttendanceScheduler.name);

  constructor(private readonly recomputeJob: AttendanceRecomputeJob) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'attendance-recompute-recent',
    waitForCompletion: true,
  })
  async recomputeRecent() {
    await this.recomputeJob.recomputeRecent();
    this.logger.debug('Recomputed recent attendance days.');
  }
}
