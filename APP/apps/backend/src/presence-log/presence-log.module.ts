import { Module } from '@nestjs/common';
import { SystemConfigModule } from '../system-config/system-config.module';
import { PresenceLogService } from './presence-log.service';
import { PresenceLogController } from './presence-log.controller';

@Module({
  imports: [SystemConfigModule],
  controllers: [PresenceLogController],
  providers: [PresenceLogService],
  exports: [PresenceLogService],
})
export class PresenceLogModule {}
