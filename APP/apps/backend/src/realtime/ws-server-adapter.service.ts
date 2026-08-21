import { Injectable } from '@nestjs/common';
import type { Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { ConnectionRegistry } from './connection-registry.service';
import type { RealtimeClientContext } from './realtime-client.types';

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface WsServerCallbacks {
  onConnection(
    socket: WebSocket,
    request: {
      cookie?: string;
      host?: string;
      url?: string;
      origin?: string;
    },
  ): void;
  onHeartbeat(socket: WebSocket, context: RealtimeClientContext): void;
  onUnavailable(socket: WebSocket): void;
}

@Injectable()
export class WsServerAdapter {
  private server: WebSocketServer | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly registry: ConnectionRegistry) {}

  attach(httpServer: Server, callbacks: WsServerCallbacks): void {
    if (this.server) return;
    this.server = new WebSocketServer({ server: httpServer, path: '/realtime' });
    this.server.on('connection', (socket, request) => {
      callbacks.onConnection(socket, {
        cookie: request.headers.cookie,
        host: request.headers.host,
        url: request.url,
        origin: request.headers.origin,
      });
    });
    this.heartbeatTimer = setInterval(() => {
      for (const [socket, context] of this.registry.clients) {
        if (socket.readyState !== WebSocket.OPEN) {
          callbacks.onUnavailable(socket);
          continue;
        }
        callbacks.onHeartbeat(socket, context);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  close(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.server?.close();
    this.server = null;
  }
}
