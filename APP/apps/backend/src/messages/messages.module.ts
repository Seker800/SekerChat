import { ExternalMessagesService } from './external-messages.service';
import { MessageDeliveryIntents } from './message-delivery-intents';
import { Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module';
import { BotAccessService } from '../common/bot-access.service';
import { FilesModule } from '../files/files.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { MessagesController } from './messages.controller';
import { MessageApplicationService } from './message-application.service';
import { MessageEventsService } from './message-events.service';
import { MessageReadReceiptService } from './message-read-receipt.service';
import { MessageSerializerService } from './message-serializer.service';
import { MessagesService } from './messages.service';
import { SendMessageUseCase } from './send-message.use-case';
import { SystemMessageService } from './system-message.service';
import { OutboxCoreModule } from '../outbox/outbox-core.module';

@Module({
  imports: [PrismaModule, FilesModule, RealtimeModule, AvatarsModule, OutboxCoreModule],
  controllers: [MessagesController],
  providers: [
    MessageDeliveryIntents,
    ExternalMessagesService,
    MessagesService,
    MessageApplicationService,
    MessageEventsService,
    MessageReadReceiptService,
    MessageSerializerService,
    BotAccessService,
    SystemMessageService,
    {
      provide: SendMessageUseCase,
      inject: [MessagesService],
      useFactory: (messagesService: MessagesService) =>
        new SendMessageUseCase(messagesService.createMessage.bind(messagesService)),
    },
  ],
  exports: [
    MessageDeliveryIntents,
    ExternalMessagesService,
    MessagesService,
    MessageApplicationService,
    SystemMessageService,
    MessageEventsService,
  ],
})
export class MessagesModule {}
