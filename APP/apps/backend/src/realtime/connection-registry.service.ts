import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { RealtimeAuthKind, RealtimeClientContext } from './realtime-client.types';

@Injectable()
export class ConnectionRegistry {
  readonly clients = new Map<WebSocket, RealtimeClientContext>();
  readonly userIdIndex = new Map<string, Set<WebSocket>>();

  add(socket: WebSocket, context: RealtimeClientContext): void {
    this.clients.set(socket, context);
    const sockets = this.userIdIndex.get(context.userId);
    if (sockets) {
      sockets.add(socket);
      return;
    }
    this.userIdIndex.set(context.userId, new Set([socket]));
  }

  remove(socket: WebSocket): RealtimeClientContext | undefined {
    const context = this.clients.get(socket);
    if (!context) return undefined;

    const sockets = this.userIdIndex.get(context.userId);
    sockets?.delete(socket);
    if (sockets?.size === 0) this.userIdIndex.delete(context.userId);
    this.clients.delete(socket);
    return context;
  }

  get(socket: WebSocket): RealtimeClientContext | undefined {
    return this.clients.get(socket);
  }

  has(socket: WebSocket): boolean {
    return this.clients.has(socket);
  }

  socketsFor(userId: string): ReadonlySet<WebSocket> {
    return this.userIdIndex.get(userId) ?? new Set<WebSocket>();
  }

  isConnected(userId: string, authKind?: RealtimeAuthKind): boolean {
    return this.connectionCount(userId, authKind) > 0;
  }

  connectionCount(userId: string, authKind?: RealtimeAuthKind): number {
    const sockets = this.userIdIndex.get(userId);
    if (!sockets?.size) return 0;
    if (!authKind) return sockets.size;

    let count = 0;
    for (const socket of sockets) {
      if (this.clients.get(socket)?.authKind === authKind) count += 1;
    }
    return count;
  }

  onlineUserIds(authKind?: RealtimeAuthKind): Set<string> {
    if (!authKind) return new Set(this.userIdIndex.keys());
    return new Set(
      [...this.userIdIndex.keys()].filter((userId) => this.isConnected(userId, authKind)),
    );
  }

  clear(): void {
    this.clients.clear();
    this.userIdIndex.clear();
  }
}
