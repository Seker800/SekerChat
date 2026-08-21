import { Module } from '@nestjs/common';
import { OutboxCoreModule } from '../outbox/outbox-core.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';

@Module({
  imports: [OutboxCoreModule, SystemConfigModule],
  controllers: [ServersController],
  providers: [ServersService],
  exports: [ServersService],
})
export class ServersModule {}
