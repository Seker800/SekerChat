import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { OutboxCoreModule } from '../outbox/outbox-core.module';
import { SubscriptionRealtimePublisher } from './subscription-realtime-publisher.service';
import { SubscriptionStorageService } from './subscription-storage.service';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

@Module({
  imports: [PrismaModule, FilesModule, RealtimeModule, SystemConfigModule, OutboxCoreModule],
  controllers: [SubscriptionsController],
  providers: [
    SubscriptionsService,
    SubscriptionStorageService,
    SubscriptionRealtimePublisher,
  ],
  exports: [
    SubscriptionsService,
    SubscriptionStorageService,
    SubscriptionRealtimePublisher,
  ],
})
export class SubscriptionsModule {}
