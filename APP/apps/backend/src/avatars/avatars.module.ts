import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { AvatarsController } from './avatars.controller';
import { AvatarsService } from './avatars.service';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [FilesModule, SystemConfigModule, ServersModule],
  controllers: [AvatarsController],
  providers: [AvatarsService],
  exports: [AvatarsService],
})
export class AvatarsModule {}
