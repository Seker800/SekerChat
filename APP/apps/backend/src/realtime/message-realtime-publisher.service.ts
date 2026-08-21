import { Injectable } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

@Injectable()
export class MessageRealtimePublisher {
  constructor(private readonly realtimeService: RealtimeService) {}

  publishCreated(groupId: string, eventSequence: bigint, message: unknown) {
    return this.realtimeService.emitMessageCreated(groupId, eventSequence, message);
  }

  publishUpdated(groupId: string, messageId: string, message: unknown) {
    return this.realtimeService.emitMessageUpdated(groupId, messageId, message);
  }
}
