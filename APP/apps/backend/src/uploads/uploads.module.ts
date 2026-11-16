import { WorkQueuesModule } from '../work-queues/work-queues.module';
import { UploadResourceInterceptor } from './upload-resource.interceptor';
import { Module } from '@nestjs/common';
import { ArtifactsModule } from '../artifacts/artifacts.module';
import { FilesModule } from '../files/files.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { UploadCleanupService } from './upload-cleanup.service';
import { UploadRecoveryService } from './upload-recovery.service';
import { UploadsController } from './uploads.controller';
import { UploadsService } from './uploads.service';
import { AlbumModule } from '../album/album.module';

@Module({
  imports: [
    WorkQueuesModule,
    PrismaModule,
    FilesModule,
    ArtifactsModule,
    SystemConfigModule,
    SubscriptionsModule,
    AlbumModule,
  ],
  controllers: [UploadsController],
  providers: [
    UploadsService,
    UploadResourceInterceptor,
    UploadCleanupService,
    UploadRecoveryService,
  ],
  exports: [UploadsService],
})
export class UploadsModule {}
