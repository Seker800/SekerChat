import { Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module';
import { MessagesModule } from '../messages/messages.module';
import { GroupLifecycleModule } from '../group-lifecycle/group-lifecycle.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupAdminDiscoveryService } from './group-admin-discovery.service';
import { GroupCategoryService } from './group-category.service';
import { GroupChannelService } from './group-channel.service';
import { GroupMembershipService } from './group-membership.service';
import { GroupPresenter } from './group-presenter.service';
import { GroupQueryService } from './group-query.service';
import { ServersModule } from '../servers/servers.module';

@Module({
  imports: [
    RealtimeModule,
    AvatarsModule,
    MessagesModule,
    SystemConfigModule,
    GroupLifecycleModule,
    ServersModule,
  ],
  controllers: [GroupsController],
  providers: [
    GroupsService,
    GroupCategoryService,
    GroupQueryService,
    GroupMembershipService,
    GroupAdminDiscoveryService,
    GroupChannelService,
    GroupPresenter,
  ],
  exports: [GroupsService, GroupCategoryService, GroupQueryService, GroupPresenter],
})
export class GroupsModule {}
