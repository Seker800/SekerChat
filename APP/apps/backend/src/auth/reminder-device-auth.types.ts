import type { User } from '@prisma/client';

export interface ReminderDeviceSession {
  deviceToken: string;
  deviceTokenId: string;
  deviceName: string;
  user: Pick<User, 'id' | 'email' | 'displayName' | 'role'>;
}

export interface ReminderDevicePrincipal {
  deviceTokenId: string;
  userId: string;
  email: string;
  displayName: string | null;
  dndUntil: Date | null;
}

export interface ReminderRealtimeTicket {
  ticket: string;
  expiresAt: Date;
}
