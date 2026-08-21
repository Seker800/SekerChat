import { Module } from '@nestjs/common';
import { DmModule } from '../dm/dm.module';
import { GroupsModule } from '../groups/groups.module';
import { MessagesModule } from '../messages/messages.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { WorkspaceBootstrapService } from './workspace-bootstrap.service';
import { WorkspaceController } from './workspace.controller';

@Module({
  imports: [
    DmModule,
    GroupsModule,
    MessagesModule,
    SystemConfigModule,
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceBootstrapService],
})
export class WorkspaceModule {}
