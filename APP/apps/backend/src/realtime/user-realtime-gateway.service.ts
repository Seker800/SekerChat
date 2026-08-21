import { Injectable } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

@Injectable()
export class UserRealtimeGateway {
  constructor(private readonly realtimeService: RealtimeService) {}

  disconnectSessions(userId: string): number {
    return this.realtimeService.disconnectUserSessions(userId);
  }

  publishDndChanged(userId: string, dndUntil: Date | null): void {
    this.realtimeService.broadcastDndChanged(userId, dndUntil);
  }

  getOnlineUserIds(): Set<string> {
    return this.realtimeService.getOnlineUserIds();
  }
}
