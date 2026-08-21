import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionService } from '../system-config/permission.service';
import { SystemConfigModule } from '../system-config/system-config.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceScheduler } from './attendance.scheduler';
import { AttendanceService } from './attendance.service';
import { CheckInCommandService } from './check-in-command.service';
import { AttendanceRecomputeJob } from './attendance-recompute.job';
import { AttendanceActionRecorder } from './attendance-action-recorder.service';
import { AttendanceProjectionService } from './attendance-projection.service';
import { AttendanceQueryService } from './attendance-query.service';

@Module({
  imports: [PrismaModule, SystemConfigModule],
  controllers: [AttendanceController],
  providers: [
    CheckInCommandService,
    AttendanceActionRecorder,
    AttendanceProjectionService,
    AttendanceQueryService,
    AttendanceService,
    AttendanceRecomputeJob,
    AttendanceScheduler,
    PermissionService,
  ],
  exports: [AttendanceService],
})
export class AttendanceModule {}
