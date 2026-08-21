import { Module } from '@nestjs/common';
import { AvatarsModule } from '../avatars/avatars.module';
import { FilesModule } from '../files/files.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { FileShareAttemptLimiterService } from './file-share-attempt-limiter.service';
import { FileShareCredentialsService } from './file-share-credentials.service';
import { FileSharesController } from './file-shares.controller';
import { FileSharesService } from './file-shares.service';
import { PublicFileSharesController } from './public-file-shares.controller';

@Module({
  imports: [PrismaModule, FilesModule, AvatarsModule, RealtimeModule],
  controllers: [FileSharesController, PublicFileSharesController],
  providers: [FileSharesService, FileShareCredentialsService, FileShareAttemptLimiterService],
  exports: [FileSharesService],
})
export class FileSharesModule {}
