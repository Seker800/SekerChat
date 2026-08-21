import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [RealtimeModule, MessagesModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
