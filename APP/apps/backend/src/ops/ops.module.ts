import { Module } from '@nestjs/common';
import { GroupLifecycleModule } from '../group-lifecycle/group-lifecycle.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';

@Module({
  imports: [PrismaModule, SystemConfigModule, GroupLifecycleModule],
  controllers: [OpsController],
  providers: [OpsService],
  exports: [OpsService],
})
export class OpsModule {}
