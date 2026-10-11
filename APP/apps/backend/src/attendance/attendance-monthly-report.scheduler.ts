import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AttendanceMonthlyReportService } from './attendance-monthly-report.service';

@Injectable()
export class AttendanceMonthlyReportScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AttendanceMonthlyReportScheduler.name);

  constructor(private readonly reports: AttendanceMonthlyReportService) {}

  onApplicationBootstrap(): void {
    void this.generateMissingReports();
  }

  @Cron('0 5 * * * *', {
    name: 'attendance-monthly-reports',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  async generateMissingReports(): Promise<void> {
    try {
      const created = await this.reports.generateMissingReports();
      if (created > 0) this.logger.log(`Created ${created} monthly attendance reports.`);
    } catch (error) {
      this.logger.error('Monthly attendance report generation failed.', error);
    }
  }
}
