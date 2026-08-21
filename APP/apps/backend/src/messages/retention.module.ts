import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { RetentionService } from './retention.service';

@Module({
  imports: [PrismaModule, FilesModule, SystemConfigModule],
  providers: [RetentionService],
})
export class RetentionModule {}
