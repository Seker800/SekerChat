import { Injectable } from '@nestjs/common';
import { serializeRealtimeEvent, type RealtimeEvent } from '@sekerchat/contracts';
import { WebSocket } from 'ws';
import { ConnectionRegistry } from './connection-registry.service';
import { GroupAudienceResolver } from './group-audience-resolver.service';

@Injectable()
export class RealtimeEventPublisher {
  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly audienceResolver: GroupAudienceResolver,
  ) {}

  async publishToGroup<TPayload>(
    groupId: string,
    event: RealtimeEvent<TPayload>,
    options?: { includeUserIds?: string[]; excludeUserIds?: string[] },
  ): Promise<void> {
    if (!this.registry.clients.size) return;
    const audience = await this.audienceResolver.resolve(groupId);
    for (const userId of options?.includeUserIds ?? []) if (userId) audience.add(userId);
    for (const userId of options?.excludeUserIds ?? []) if (userId) audience.delete(userId);

    const serializedEvent = serializeRealtimeEvent(event);
    for (const userId of audience) {
      for (const socket of this.registry.socketsFor(userId)) {
        if (socket.readyState === WebSocket.OPEN) socket.send(serializedEvent);
      }
    }
  }

  publishToAll(event: RealtimeEvent): void {
    if (!this.registry.clients.size) return;
    const serializedEvent = serializeRealtimeEvent(event);
    for (const socket of this.registry.clients.keys()) {
      if (socket.readyState === WebSocket.OPEN) socket.send(serializedEvent);
    }
  }
}
