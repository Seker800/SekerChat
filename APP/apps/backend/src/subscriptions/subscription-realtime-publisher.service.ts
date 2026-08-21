import { Injectable } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class SubscriptionRealtimePublisher {
  constructor(private readonly realtimeService: RealtimeService) {}

  publishSubscriptionChanged(payload: {
    postId: string;
    reason: 'published' | 'updated' | 'withdrawn' | 'pinned' | 'deleted' | 'confirmed';
  }, eventId?: string): Promise<void> {
    return this.realtimeService.emitSubscriptionChanged(payload, eventId);
  }
}
