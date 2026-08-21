import { forwardRef, Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PermissionService } from '../system-config/permission.service';
import { SystemConfigModule } from '../system-config/system-config.module';
import { CurrentUserController } from './current-user.controller';
import { UsersController } from './users.controller';
import { CurrentUserService } from './current-user.service';
import { UsersService } from './users.service';
import { DndSchedulerService } from './dnd-scheduler.service';

@Module({
  imports: [PrismaModule, AvatarsModule, forwardRef(() => RealtimeModule), SystemConfigModule],
  controllers: [UsersController, CurrentUserController],
  providers: [UsersService, CurrentUserService, DndSchedulerService, PermissionService],
  exports: [UsersService, CurrentUserService],
})
export class UsersModule {}
