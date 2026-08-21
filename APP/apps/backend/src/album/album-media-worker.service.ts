import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlbumMediaJobService } from './album-media-job.service';
import { AlbumStorageService } from './album-storage.service';

@Injectable()
export class AlbumMediaWorkerService {
  private readonly logger = new Logger(AlbumMediaWorkerService.name);
  private drainPromise: Promise<void> | null = null;

  constructor(
    private readonly jobs: AlbumMediaJobService,
    private readonly storage: AlbumStorageService,
  ) {}

  @Cron('*/10 * * * * *', {
    name: 'album-media-worker',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  processPendingJobs(): Promise<void> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = this.processBatch().finally(() => {
      this.drainPromise = null;
    });
    return this.drainPromise;
  }

  private async processBatch(): Promise<void> {
    for (let index = 0; index < 10; index += 1) {
      const job = await this.jobs.claimNext();
      if (!job) return;
      try {
        if (job.kind === 'GENERATE_THUMBNAIL') {
          await this.storage.generateThumbnailForPhoto(job.photoId);
        } else if (job.kind === 'HASH_CONTENT') {
          await this.storage.hashPhotoContent(job.photoId);
        } else {
          await this.storage.purgeDeletedPhoto(job.photoId);
        }
        await this.jobs.markCompleted(job.id);
      } catch (error) {
        await this.jobs.markFailed(job, error);
        this.logger.warn(
          'album_media_job_failed',
          JSON.stringify({
            jobId: job.id,
            photoId: job.photoId,
            kind: job.kind,
            attempts: job.attempts,
            error: error instanceof Error ? error.message : 'Unknown',
          }),
        );
      }
    }
  }
}
