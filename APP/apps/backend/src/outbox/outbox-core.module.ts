import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OutboxService } from './outbox.service';
import { OutboxWakeupService } from './outbox-wakeup.service';

@Module({
  imports: [PrismaModule],
  providers: [OutboxService, OutboxWakeupService],
  exports: [OutboxService, OutboxWakeupService],
})
export class OutboxCoreModule {}
