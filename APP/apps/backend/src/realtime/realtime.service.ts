import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Server } from 'http';
import { randomUUID } from 'crypto';
import { URL } from 'url';
import { WebSocket } from 'ws';
import { isAllowedCorsOrigin, resolveCorsOrigins } from '../common/cors-origins';
import { REALTIME_EVENT_VERSION, type RealtimeEvent } from '@sekerchat/contracts';
import { ConnectionAuthenticator } from './connection-authenticator.service';
import { ConnectionRegistry } from './connection-registry.service';
import { GroupAudienceResolver } from './group-audience-resolver.service';
import type { RealtimeClientContext } from './realtime-client.types';
import { RealtimeEventPublisher } from './realtime-event-publisher.service';
import { WsServerAdapter } from './ws-server-adapter.service';
import { PresenceCoordinator } from './presence-coordinator.service';

const HEARTBEAT_TIMEOUT_MS = 10_000;

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly clients: ConnectionRegistry['clients'];
  /** userId → set of WebSocket connections (one user may have multiple devices/tabs) */
  private readonly userIdIndex: ConnectionRegistry['userIdIndex'];
  private readonly allowedOrigins: string[];
  constructor(
    private readonly registry: ConnectionRegistry,
    private readonly authenticator: ConnectionAuthenticator,
    private readonly audienceResolver: GroupAudienceResolver,
    private readonly eventPublisher: RealtimeEventPublisher,
    private readonly wsServerAdapter: WsServerAdapter,
    private readonly presenceCoordinator: PresenceCoordinator,
  ) {
    this.clients = this.registry.clients;
    this.userIdIndex = this.registry.userIdIndex;
    this.allowedOrigins = resolveCorsOrigins();
  }

  private addClient(socket: WebSocket, context: RealtimeClientContext): void {
    this.registry.add(socket, context);
  }

  private clearHeartbeatTimeout(context: RealtimeClientContext): void {
    this.presenceCoordinator.clearHeartbeatTimeout(context);
  }

  private isUserConnected(userId: string, authKind?: RealtimeClientContext['authKind']): boolean {
    return this.registry.isConnected(userId, authKind);
  }

  private connectClient(socket: WebSocket, context: RealtimeClientContext): void {
    this.presenceCoordinator.connect(socket, context);
  }

  private disconnectClient(socket: WebSocket, options?: { terminate?: boolean }): void {
    this.presenceCoordinator.disconnect(socket, options);
  }

  disconnectUserSessions(userId: string): number {
    return this.presenceCoordinator.disconnectUserSessions(userId);
  }

  private scheduleHeartbeatTimeout(socket: WebSocket, context: RealtimeClientContext): void {
    this.clearHeartbeatTimeout(context);
    context.heartbeatTimeout = setTimeout(() => {
      if (!this.clients.has(socket)) {
        return;
      }

      this.logger.warn(
        `Realtime heartbeat timed out for user ${context.userId}, terminating socket`,
      );
      this.disconnectClient(socket, { terminate: true });
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private removeClient(socket: WebSocket): void {
    this.registry.remove(socket);
  }

  broadcastDndChanged(userId: string, dndUntil: Date | null): void {
    this.presenceCoordinator.updateDnd(userId, dndUntil);
  }

  getOnlineUserIds(): Set<string> {
    return this.getOnlineUserIdsByKind();
  }

  getBrowserOnlineUserIds(): Set<string> {
    return this.getOnlineUserIdsByKind('browser');
  }

  private getOnlineUserIdsByKind(authKind?: RealtimeClientContext['authKind']): Set<string> {
    return this.registry.onlineUserIds(authKind);
  }

  attachServer(server: Server): void {
    this.wsServerAdapter.attach(server, {
      onConnection: (socket, request) => {
        void this.handleConnection(
          socket,
          request.cookie,
          request.host,
          request.url,
          request.origin,
        );
      },
      onHeartbeat: (socket, client) => {
        client.isAlive = false;
        this.scheduleHeartbeatTimeout(socket, client);
        socket.ping();
      },
      onUnavailable: (socket) => this.disconnectClient(socket),
    });
  }

  async emitMessageCreated<TMessage>(
    groupId: string,
    eventId: bigint,
    message: TMessage,
  ): Promise<void> {
    await this.emitToGroupMembers(groupId, {
      eventVersion: REALTIME_EVENT_VERSION,
      eventId: eventId.toString(),
      type: 'message.created.v1',
      groupId,
      occurredAt: new Date().toISOString(),
      payload: message,
    });
  }

  async emitMessageUpdated<TMessage>(
    groupId: string,
    messageId: string,
    message: TMessage,
  ): Promise<void> {
    await this.emitToGroupMembers(groupId, {
      eventVersion: REALTIME_EVENT_VERSION,
      eventId: `message-updated:${messageId}:${randomUUID()}`,
      type: 'message.updated.v1',
      groupId,
      occurredAt: new Date().toISOString(),
      payload: message,
    });
  }

  async emitReadCursorChanged(
    groupId: string,
    payload: { userId: string; lastReadEventSequence: string },
  ): Promise<void> {
    await this.emitToGroupMembers(groupId, {
      eventVersion: REALTIME_EVENT_VERSION,
      eventId: `read-cursor:${groupId}:${payload.userId}:${payload.lastReadEventSequence}`,
      type: 'message.read-cursor.changed.v1',
      groupId,
      occurredAt: new Date().toISOString(),
      payload,
    });
  }

  async emitGroupUpdated(
    groupId: string,
    options?: {
      actorUserId?: string;
      includeUserIds?: string[];
      excludeUserIds?: string[];
      reason?: string;
    },
  ): Promise<void> {
    await this.emitToGroupMembers(
      groupId,
      {
        eventVersion: REALTIME_EVENT_VERSION,
        eventId: `group-updated:${groupId}:${randomUUID()}`,
        type: 'group.updated.v1',
        groupId,
        occurredAt: new Date().toISOString(),
        payload: {
          actorUserId: options?.actorUserId ?? null,
          groupId,
          reason: options?.reason ?? 'group_updated',
        },
      },
      options,
    );
  }

  async emitTaskCreated<TTask>(groupId: string, task: TTask): Promise<void> {
    await this.emitToGroupMembers(groupId, {
      eventVersion: REALTIME_EVENT_VERSION,
      eventId: `task-created:${groupId}:${randomUUID()}`,
      type: 'task.created.v1',
      groupId,
      occurredAt: new Date().toISOString(),
      payload: task,
    });
  }

  async emitTaskUpdated<TTask>(groupId: string, task: TTask): Promise<void> {
    await this.emitToGroupMembers(groupId, {
      eventVersion: REALTIME_EVENT_VERSION,
      eventId: `task-updated:${groupId}:${randomUUID()}`,
      type: 'task.updated.v1',
      groupId,
      occurredAt: new Date().toISOString(),
      payload: task,
    });
  }

  async emitTaskDeleted(groupId: string, payload: { id: string }): Promise<void> {
    await this.emitToGroupMembers(groupId, {
      eventVersion: REALTIME_EVENT_VERSION,
      eventId: `task-deleted:${groupId}:${randomUUID()}`,
      type: 'task.deleted.v1',
      groupId,
      occurredAt: new Date().toISOString(),
      payload,
    });
  }

  async emitSubscriptionChanged(payload: {
    postId: string;
    reason: 'published' | 'updated' | 'withdrawn' | 'pinned' | 'deleted' | 'confirmed';
  }, durableEventId?: string): Promise<void> {
    this.eventPublisher.publishToAll({
      eventVersion: REALTIME_EVENT_VERSION,
      eventId: durableEventId
        ? `subscription:${durableEventId}`
        : `subscription:${payload.postId}:${randomUUID()}`,
      type: 'subscription.changed.v1',
      groupId: '',
      occurredAt: new Date().toISOString(),
      payload,
    } satisfies RealtimeEvent<typeof payload>);
  }

  private broadcastPresence(userId: string, online: boolean): void {
    this.presenceCoordinator.publishPresence(userId, online);
  }

  private getConnectionCount(userId: string, authKind?: RealtimeClientContext['authKind']): number {
    return this.registry.connectionCount(userId, authKind);
  }

  /** Invalidate cached group member list — call after invite/remove/join/leave. */
  invalidateGroupMemberCache(groupId: string): void {
    this.audienceResolver.invalidate(groupId);
  }

  private async getGroupMemberIds(groupId: string): Promise<Set<string>> {
    return this.audienceResolver.resolve(groupId);
  }

  private async emitToGroupMembers<TPayload>(
    groupId: string,
    event: RealtimeEvent<TPayload>,
    options?: {
      includeUserIds?: string[];
      excludeUserIds?: string[];
    },
  ): Promise<void> {
    await this.eventPublisher.publishToGroup(groupId, event, options);
  }

  onModuleDestroy(): void {
    for (const [socket, client] of this.clients.entries()) {
      this.clearHeartbeatTimeout(client);
      socket.close();
    }

    this.registry.clear();
    this.wsServerAdapter.close();
  }

  private validateWebSocketOrigin(originHeader: string | undefined): void {
    if (!originHeader) return;

    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction) return;

    try {
      if (!isAllowedCorsOrigin(new URL(originHeader).origin, this.allowedOrigins)) {
        throw new Error(`WebSocket origin rejected: ${originHeader}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid origin';
      this.logger.warn(message);
      throw new Error('Unauthorized WebSocket origin');
    }
  }

  private async handleConnection(
    socket: WebSocket,
    cookieHeader: string | undefined,
    hostHeader: string | undefined,
    requestUrl?: string,
    originHeader?: string,
  ): Promise<void> {
    try {
      this.validateWebSocketOrigin(originHeader);
      const authResult = await this.authenticateConnection(cookieHeader, hostHeader, requestUrl);

      this.connectClient(socket, authResult);

      socket.on('pong', () => {
        authResult.isAlive = true;
        this.clearHeartbeatTimeout(authResult);
      });

      socket.on('close', () => this.disconnectClient(socket));

      socket.on('error', (error) => {
        this.logger.warn(`Realtime socket error for user ${authResult.userId}: ${error.message}`);
        this.disconnectClient(socket);
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unauthorized';
      this.logger.warn(`Rejected realtime connection: ${reason}`);
      socket.close(4401, 'Unauthorized');
    }
  }

  private async authenticateConnection(
    cookieHeader: string | undefined,
    hostHeader: string | undefined,
    requestUrl?: string,
  ): Promise<RealtimeClientContext> {
    return this.authenticator.authenticate(cookieHeader, hostHeader, requestUrl);
  }

  async authenticateReminderDeviceToken(
    reminderDeviceToken: string,
  ): Promise<RealtimeClientContext> {
    return this.authenticator.authenticateReminderDeviceToken(reminderDeviceToken);
  }
}
