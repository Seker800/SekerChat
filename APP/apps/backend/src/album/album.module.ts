import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SystemConfigModule } from '../system-config/system-config.module';
import { AlbumController } from './album.controller';
import { AlbumMediaJobService } from './album-media-job.service';
import { AlbumMediaWorkerService } from './album-media-worker.service';
import { AlbumMediaAccessService } from './album-media-access.service';
import { AlbumService } from './album.service';
import { AlbumStorageService } from './album-storage.service';
import { AlbumVideoService } from './album-video.service';
@Module({
  imports: [PrismaModule, FilesModule, SystemConfigModule],
  controllers: [AlbumController],
  providers: [
    AlbumService,
    AlbumStorageService,
    AlbumMediaAccessService,
    AlbumMediaJobService,
    AlbumMediaWorkerService,
    AlbumVideoService,
  ],
  exports: [AlbumService, AlbumStorageService, AlbumVideoService],
})
export class AlbumModule {}
