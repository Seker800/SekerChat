import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxCoreModule } from '../outbox/outbox-core.module';
import { ArchiveGroupApplicationService } from './archive-group-application.service';

@Module({
  imports: [PrismaModule, OutboxCoreModule],
  providers: [ArchiveGroupApplicationService],
  exports: [ArchiveGroupApplicationService],
})
export class GroupLifecycleModule {}
