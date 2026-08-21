import { Injectable, OnModuleInit } from '@nestjs/common';
import { BotAccessService } from '../common/bot-access.service';
import { MessageEventsService, UserMessageCreatedEvent } from '../messages/message-events.service';
import { BotsService } from './bots.service';

@Injectable()
export class BotMessageDispatchService implements OnModuleInit {
  constructor(
    private readonly botsService: BotsService,
    private readonly messageEventsService: MessageEventsService,
    private readonly botAccessService: BotAccessService,
  ) {}

  onModuleInit(): void {
    this.messageEventsService.registerUserMessageCreatedHandler((event) =>
      this.handleUserMessageCreated(event),
    );
  }

  private async handleUserMessageCreated(event: UserMessageCreatedEvent): Promise<void> {
    if (!event.text) {
      return;
    }
    const messageText = event.text;

    const botUserIds = await this.botAccessService.listReplyTargets({
      group: event.group,
      actorUserId: event.actorUserId,
      mentionedUserIds: event.mentionedUserIds,
    });

    if (botUserIds.length === 0) {
      return;
    }

    const sender = event.group.members.find((member) => member.userId === event.actorUserId);
    const fromUserName = sender?.user.displayName ?? sender?.user.email ?? 'user';

    await Promise.all(botUserIds.map((botUserId) =>
      this.botsService.handleIncomingMessage(
        botUserId,
        event.group.id,
        event.actorUserId,
        fromUserName,
        messageText,
        event.eventId,
      ),
    ));
  }
}
