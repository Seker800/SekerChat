import { Module } from '@nestjs/common';
import { WorkQueueSignals } from './work-queue-signals.service';

@Module({ providers: [WorkQueueSignals], exports: [WorkQueueSignals] })
export class WorkQueuesModule {}
