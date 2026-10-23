import { FilePreviewJobService } from './file-preview-job.service';
import { FilePreviewWorkerService } from './file-preview-worker.service';
import { FileRetirementService } from './file-retirement.service';
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { ObjectStorageGateway } from './object-storage.gateway';
import { FileAccessService } from './file-access.service';
import { FileUrlService } from './file-url.service';
import { ImageMetadataService } from './image-metadata.service';
import { MediaVideoService } from './media-video.service';

@Module({
  imports: [PrismaModule, SystemConfigModule],
  controllers: [FilesController],
  providers: [
    FilePreviewJobService,
    FilePreviewWorkerService,
    ObjectStorageGateway,
    FileAccessService,
    FileUrlService,
    ImageMetadataService,
    FilesService,
    FileRetirementService,
    MediaVideoService,
  ],
  exports: [
    ObjectStorageGateway,
    FileAccessService,
    FileUrlService,
    ImageMetadataService,
    FilesService,
    FileRetirementService,
    MediaVideoService,
  ],
})
export class FilesModule {}
