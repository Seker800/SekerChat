import { Injectable } from '@nestjs/common';
import type { OutboxEvent, Prisma } from '@prisma/client';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { OUTBOX_EVENT_TYPES } from './outbox.types';

type ServerVisibilityPayload = {
  serverId: string;
  hidden: boolean;
};

@Injectable()
export class ServerVisibilityOutboxHandler {
  readonly eventType = OUTBOX_EVENT_TYPES.serverVisibilityChanged;

  constructor(private readonly realtimePublisher: GroupRealtimePublisher) {}

  async handle(event: OutboxEvent): Promise<void> {
    const payload = this.parsePayload(event.payload);
    await this.realtimePublisher.publishServerVisibilityChanged(payload.serverId, payload.hidden);
  }

  private parsePayload(payload: Prisma.JsonValue): ServerVisibilityPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof payload.serverId !== 'string' ||
      typeof payload.hidden !== 'boolean'
    ) {
      throw new Error('Invalid server.visibility.changed.v1 outbox payload.');
    }
    return { serverId: payload.serverId, hidden: payload.hidden };
  }
}
