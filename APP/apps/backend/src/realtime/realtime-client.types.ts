import type { WebSocket } from 'ws';

export type RealtimeAuthKind = 'browser' | 'reminder';

export interface RealtimeClientContext {
  userId: string;
  email: string;
  displayName: string | null;
  authKind: RealtimeAuthKind;
  reminderDeviceTokenId?: string;
  isAlive: boolean;
  dndUntil: Date | null;
  heartbeatTimeout: ReturnType<typeof setTimeout> | null;
}

export interface RealtimeConnection {
  socket: WebSocket;
  context: RealtimeClientContext;
}
