import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxService } from './outbox.service';
import { OutboxWakeupService } from './outbox-wakeup.service';

@Injectable()
export class OutboxWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorkerService.name);
  private readonly batchSize = 25;
  private drainRequested = false;
  private drainPromise: Promise<void> | null = null;
  private unsubscribeWakeup: (() => void) | null = null;

  constructor(
    private readonly outboxService: OutboxService,
    private readonly dispatcher: OutboxDispatcherService,
    private readonly wakeupService: OutboxWakeupService,
  ) {}

  onModuleInit(): void {
    this.unsubscribeWakeup = this.wakeupService.subscribe(() => {
      void this.processPendingEvents().catch((error) => {
        this.logger.warn(
          'outbox_immediate_delivery_failed',
          error instanceof Error ? error.message : 'Unknown',
        );
      });
    });
  }

  onModuleDestroy(): void {
    this.unsubscribeWakeup?.();
    this.unsubscribeWakeup = null;
  }

  @Cron('*/10 * * * * *', {
    name: 'outbox-worker',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  async processPendingEvents(): Promise<void> {
    this.drainRequested = true;
    if (this.drainPromise) return this.drainPromise;

    this.drainPromise = this.processRequestedBatches();
    try {
      await this.drainPromise;
    } finally {
      this.drainPromise = null;
    }
  }

  private async processRequestedBatches(): Promise<void> {
    let batchWasFull = false;
    do {
      this.drainRequested = false;
      batchWasFull = await this.processBatch();
    } while (this.drainRequested || batchWasFull);
  }

  private async processBatch(): Promise<boolean> {
    for (let index = 0; index < this.batchSize; index += 1) {
      const event = await this.outboxService.claimNext();
      if (!event) return false;

      try {
        await this.dispatcher.dispatch(event);
        await this.outboxService.markProcessed(event.id);
      } catch (error) {
        await this.outboxService.markFailed(event, error);
        this.logger.warn(
          'outbox_event_delivery_failed',
          JSON.stringify({
            eventId: event.id,
            eventType: event.eventType,
            attempts: event.attempts,
            error: error instanceof Error ? error.message : 'Unknown',
          }),
        );
      }
    }
    return true;
  }
}
