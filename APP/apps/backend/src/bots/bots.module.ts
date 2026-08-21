import { Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module';
import { BotAccessService } from '../common/bot-access.service';
import { MessagesModule } from '../messages/messages.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { BotMessageDispatchService } from './bot-message-dispatch.service';
import { BotsController, BotsPublicController } from './bots.controller';
import { BotsService } from './bots.service';
import { BotReplyDeliveryRepository } from './bot-reply-delivery.repository';

@Module({
  imports: [PrismaModule, AvatarsModule, MessagesModule, SystemConfigModule],
  controllers: [BotsController, BotsPublicController],
  providers: [BotsService, BotMessageDispatchService, BotReplyDeliveryRepository, BotAccessService],
  exports: [BotsService],
})
export class BotsModule {}
