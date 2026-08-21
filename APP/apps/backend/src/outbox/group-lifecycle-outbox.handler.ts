import { Injectable } from '@nestjs/common';
import type { OutboxEvent, Prisma } from '@prisma/client';
import { SystemMessageService } from '../messages/system-message.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { OUTBOX_EVENT_TYPES } from './outbox.types';

type GroupLifecyclePayload = {
  groupId: string;
  notification: { actorUserId: string; text: string } | null;
};

@Injectable()
export class GroupLifecycleOutboxHandler {
  readonly eventType = OUTBOX_EVENT_TYPES.groupLifecycleChanged;

  constructor(
    private readonly systemMessageService: SystemMessageService,
    private readonly groupRealtimePublisher: GroupRealtimePublisher,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const payload = this.parsePayload(event.payload);
    this.groupRealtimePublisher.invalidateGroupMemberCache(payload.groupId);
    if (payload.notification) {
      await this.systemMessageService.createSystemMessage(
        payload.groupId,
        payload.notification.actorUserId,
        payload.notification.text,
        event.id,
      );
    }
    await this.groupRealtimePublisher.publishGroupUpdated(payload.groupId);
  }

  private parsePayload(payload: Prisma.JsonValue): GroupLifecyclePayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof payload.groupId !== 'string'
    ) {
      throw new Error('Invalid group.lifecycle.changed.v1 outbox payload.');
    }
    const notification = payload.notification;
    if (notification === null) return { groupId: payload.groupId, notification: null };
    if (
      typeof notification !== 'object' ||
      Array.isArray(notification) ||
      typeof notification.actorUserId !== 'string' ||
      typeof notification.text !== 'string'
    ) {
      throw new Error('Invalid group lifecycle notification payload.');
    }
    return {
      groupId: payload.groupId,
      notification: {
        actorUserId: notification.actorUserId,
        text: notification.text,
      },
    };
  }
}
