import { Injectable } from '@nestjs/common';
import type { OutboxEvent } from '@prisma/client';
import { ArtifactUploadedOutboxHandler } from './artifact-uploaded-outbox.handler';
import { GroupLifecycleOutboxHandler } from './group-lifecycle-outbox.handler';
import { UserMessageCreatedOutboxHandler } from './user-message-created-outbox.handler';
import { ServerLifecycleOutboxHandler } from './server-lifecycle-outbox.handler';
import { SubscriptionChangedOutboxHandler } from './subscription-changed-outbox.handler';

@Injectable()
export class OutboxDispatcherService {
  constructor(
    private readonly artifactUploadedHandler: ArtifactUploadedOutboxHandler,
    private readonly groupLifecycleHandler: GroupLifecycleOutboxHandler,
    private readonly userMessageCreatedHandler: UserMessageCreatedOutboxHandler,
    private readonly serverLifecycleHandler: ServerLifecycleOutboxHandler,
    private readonly subscriptionChangedHandler: SubscriptionChangedOutboxHandler,
  ) {}

  dispatch(event: OutboxEvent): Promise<void> {
    if (event.eventType === this.artifactUploadedHandler.eventType) {
      return this.artifactUploadedHandler.handle(event);
    }
    if (event.eventType === this.groupLifecycleHandler.eventType) {
      return this.groupLifecycleHandler.handle(event);
    }
    if (event.eventType === this.userMessageCreatedHandler.eventType) {
      return this.userMessageCreatedHandler.handle(event);
    }
    if (event.eventType === this.serverLifecycleHandler.eventType) {
      return this.serverLifecycleHandler.handle(event);
    }
    if (event.eventType === this.subscriptionChangedHandler.eventType) {
      return this.subscriptionChangedHandler.handle(event);
    }
    throw new Error(`Unsupported outbox event type: ${event.eventType}`);
  }
}
