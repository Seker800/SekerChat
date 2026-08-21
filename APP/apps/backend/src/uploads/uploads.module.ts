import { DynamicModule, InjectionToken, Module, ModuleMetadata } from '@nestjs/common';
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
import { UPLOAD_TARGET_HANDLERS, UploadTargetHandler } from './upload-target-handler';
import { UploadTargetRegistry } from './upload-target-registry';

@Module({
  imports: [
    PrismaModule,
    FilesModule,
    ArtifactsModule,
    SystemConfigModule,
    SubscriptionsModule,
    AlbumModule,
  ],
  controllers: [UploadsController],
  providers: [
    {
      provide: UPLOAD_TARGET_HANDLERS,
      useValue: [],
    },
    UploadTargetRegistry,
    UploadsService,
    UploadCleanupService,
    UploadRecoveryService,
  ],
  exports: [UploadsService],
})
export class UploadsModule {
  static register(options: {
    imports: NonNullable<ModuleMetadata['imports']>;
    targetHandlers: InjectionToken[];
  }): DynamicModule {
    return {
      module: UploadsModule,
      imports: options.imports,
      providers: [
        {
          provide: UPLOAD_TARGET_HANDLERS,
          useFactory: (...handlers: UploadTargetHandler[]) => handlers,
          inject: options.targetHandlers,
        },
      ],
    };
  }
}
