import { Injectable } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

@Injectable()
export class GroupRealtimePublisher {
  constructor(private readonly realtimeService: RealtimeService) {}

  publishGroupUpdated(
    groupId: string,
    options?: {
      actorUserId?: string;
      includeUserIds?: string[];
      excludeUserIds?: string[];
      reason?: string;
    },
  ): Promise<void> {
    return this.realtimeService.emitGroupUpdated(groupId, options);
  }

  getBrowserOnlineUserIds(): Set<string> {
    return this.realtimeService.getBrowserOnlineUserIds();
  }

  publishReadCursorChanged(
    groupId: string,
    payload: { userId: string; lastReadEventSequence: string },
  ): Promise<void> {
    return this.realtimeService.emitReadCursorChanged(groupId, payload);
  }

  publishTaskCreated<TTask>(groupId: string, task: TTask): Promise<void> {
    return this.realtimeService.emitTaskCreated(groupId, task);
  }

  publishTaskUpdated<TTask>(groupId: string, task: TTask): Promise<void> {
    return this.realtimeService.emitTaskUpdated(groupId, task);
  }

  publishTaskDeleted(groupId: string, payload: { id: string }): Promise<void> {
    return this.realtimeService.emitTaskDeleted(groupId, payload);
  }

  /** Invalidate cached group member list after membership change. */
  invalidateGroupMemberCache(groupId: string): void {
    this.realtimeService.invalidateGroupMemberCache(groupId);
  }
}
