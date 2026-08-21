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
    ObjectStorageGateway,
    FileAccessService,
    FileUrlService,
    ImageMetadataService,
    FilesService,
    MediaVideoService,
  ],
  exports: [
    ObjectStorageGateway,
    FileAccessService,
    FileUrlService,
    ImageMetadataService,
    FilesService,
    MediaVideoService,
  ],
})
export class FilesModule {}
