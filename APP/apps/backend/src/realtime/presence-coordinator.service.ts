import { Injectable } from '@nestjs/common';
import { isDndActive } from '@sekerchat/shared';
import { REALTIME_EVENT_VERSION } from '@sekerchat/contracts';
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { PresenceLogService } from '../presence-log/presence-log.service';
import { ConnectionRegistry } from './connection-registry.service';
import type { RealtimeClientContext } from './realtime-client.types';
import { RealtimeEventPublisher } from './realtime-event-publisher.service';

@Injectable()
export class PresenceCoordinator {
  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly presenceLogService: PresenceLogService,
    private readonly eventPublisher: RealtimeEventPublisher,
  ) {}

  connect(socket: WebSocket, context: RealtimeClientContext): void {
    const becameBrowserOnline =
      context.authKind === 'browser' && !this.registry.isConnected(context.userId, 'browser');
    this.registry.add(socket, context);
    if (!becameBrowserOnline) return;

    void this.presenceLogService.log(context.userId, context.email, 'online', {
      displayName: context.displayName,
      isOnline: true,
      isDnd: isDndActive(context.dndUntil),
    });
    this.publishPresence(context.userId, true);
  }

  disconnect(socket: WebSocket, options?: { terminate?: boolean }): void {
    const context = this.registry.get(socket);
    if (!context) {
      if (options?.terminate && socket.readyState !== WebSocket.CLOSED) socket.terminate();
      return;
    }

    const becameBrowserOffline =
      context.authKind === 'browser' &&
      this.registry.isConnected(context.userId, 'browser') &&
      this.registry.connectionCount(context.userId, 'browser') === 1;
    this.clearHeartbeatTimeout(context);
    this.registry.remove(socket);

    if (becameBrowserOffline) {
      void this.presenceLogService.log(context.userId, context.email, 'offline', {
        displayName: context.displayName,
        isOnline: false,
        isDnd: isDndActive(context.dndUntil),
      });
      this.publishPresence(context.userId, false);
    }
    if (options?.terminate && socket.readyState !== WebSocket.CLOSED) socket.terminate();
  }

  disconnectUserSessions(userId: string): number {
    const sockets = [...this.registry.socketsFor(userId)];
    for (const socket of sockets) this.disconnect(socket, { terminate: true });
    return sockets.length;
  }

  updateDnd(userId: string, dndUntil: Date | null): void {
    let email: string | null = null;
    let displayName: string | null = null;
    for (const socket of this.registry.socketsFor(userId)) {
      const client = this.registry.get(socket);
      if (!client) continue;
      client.dndUntil = dndUntil;
      email ??= client.email;
      displayName ??= client.displayName;
    }
    if (email) {
      void this.presenceLogService.log(
        userId,
        email,
        isDndActive(dndUntil) ? 'dnd_on' : 'dnd_off',
        {
          displayName,
          isOnline: this.registry.isConnected(userId, 'browser'),
          isDnd: isDndActive(dndUntil),
        },
      );
    }
    this.publishPresence(userId, true);
  }

  clearHeartbeatTimeout(context: RealtimeClientContext): void {
    if (context.heartbeatTimeout === null) return;
    clearTimeout(context.heartbeatTimeout);
    context.heartbeatTimeout = null;
  }

  publishPresence(userId: string, online: boolean): void {
    let isDnd = false;
    if (online) {
      for (const socket of this.registry.socketsFor(userId)) {
        const client = this.registry.get(socket);
        if (client) {
          isDnd = isDndActive(client.dndUntil);
          break;
        }
      }
    }
    this.eventPublisher.publishToAll({
      eventVersion: REALTIME_EVENT_VERSION,
      eventId: `presence:${userId}:${randomUUID()}`,
      type: 'presence.changed.v1',
      groupId: '',
      occurredAt: new Date().toISOString(),
      payload: { userId, online, isDnd },
    });
  }
}
