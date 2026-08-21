import {
  Controller,
  Get,
  Headers,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ReminderSecureTransportGuard } from '../auth/guards/reminder-secure-transport.guard';
import { MessagesService } from '../messages/messages.service';
import { RealtimeService } from './realtime.service';

@Controller('realtime')
export class RealtimeController {
  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly messagesService: MessagesService,
  ) {}

  @Get('events')
  @UseGuards(ReminderSecureTransportGuard)
  async pullEvents(
    @Headers('x-reminder-device-token') reminderDeviceToken: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    const token = reminderDeviceToken?.trim();
    if (!token) {
      throw new UnauthorizedException('Missing reminder device token.');
    }

    const auth = await this.realtimeService.authenticateReminderDeviceToken(token);
    const requestedLimit = limit?.trim() ? Number(limit) : 100;

    return this.messagesService.listReminderEvents(auth.userId, {
      cursor,
      limit: requestedLimit,
    });
  }
}
