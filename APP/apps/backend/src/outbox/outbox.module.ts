import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { ArtifactUploadedOutboxHandler } from './artifact-uploaded-outbox.handler';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { GroupLifecycleOutboxHandler } from './group-lifecycle-outbox.handler';
import { OutboxCoreModule } from './outbox-core.module';
import { OutboxWorkerService } from './outbox-worker.service';
import { UserMessageCreatedOutboxHandler } from './user-message-created-outbox.handler';
import { GroupLifecycleModule } from '../group-lifecycle/group-lifecycle.module';
import { ServerLifecycleOutboxHandler } from './server-lifecycle-outbox.handler';
import { SubscriptionChangedOutboxHandler } from './subscription-changed-outbox.handler';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    PrismaModule,
    MessagesModule,
    RealtimeModule,
    OutboxCoreModule,
    GroupLifecycleModule,
    SubscriptionsModule,
  ],
  providers: [
    ArtifactUploadedOutboxHandler,
    GroupLifecycleOutboxHandler,
    OutboxDispatcherService,
    OutboxWorkerService,
    UserMessageCreatedOutboxHandler,
    ServerLifecycleOutboxHandler,
    SubscriptionChangedOutboxHandler,
  ],
  exports: [OutboxCoreModule],
})
export class OutboxModule {}
