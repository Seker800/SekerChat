import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { MessagesModule } from '../messages/messages.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { OutboxCoreModule } from '../outbox/outbox-core.module';
import { ArtifactRepository } from './artifact.repository';
import { ArtifactStorageService } from './artifact-storage.service';
import { ArtifactWorkflowService } from './artifact-workflow.service';
import { ArtifactsController } from './artifacts.controller';
import { ArtifactsService } from './artifacts.service';

@Module({
  imports: [
    PrismaModule,
    FilesModule,
    MessagesModule,
    RealtimeModule,
    SystemConfigModule,
    OutboxCoreModule,
  ],
  controllers: [ArtifactsController],
  providers: [
    ArtifactsService,
    ArtifactRepository,
    ArtifactStorageService,
    ArtifactWorkflowService,
  ],
  exports: [ArtifactsService, ArtifactRepository, ArtifactStorageService, ArtifactWorkflowService],
})
export class ArtifactsModule {}
