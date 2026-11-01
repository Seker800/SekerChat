import { IdlePollSchedule } from '../work-queues/idle-poll-schedule';
import { WorkQueueSignals } from '../work-queues/work-queue-signals.service';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { FilePreviewJobService } from './file-preview-job.service';
import type { ClaimedFilePreviewJob } from './file-preview-state';
import { ObjectStorageGateway } from './object-storage.gateway';
import { createImageProcessor } from './image-processing-policy';
import { withStoredImage } from './stored-image-processing';

@Injectable()
export class FilePreviewWorkerService {
  private readonly logger = new Logger(FilePreviewWorkerService.name);
  private drain: Promise<void> | null = null;

  private readonly poll = new IdlePollSchedule();
  private unsubscribeWakeup?: () => void;

  onModuleInit(): void {
    this.unsubscribeWakeup = this.signals?.subscribe('file-preview', () => {
      this.poll.wake();
      void this.processPendingJobs().catch(() => {
        this.poll.idle();
        this.logger.warn('immediate_queue_processing_failed');
      });
    });
  }

  onModuleDestroy(): void { this.unsubscribeWakeup?.(); }

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: FilePreviewJobService,
    private readonly objects: ObjectStorageGateway,
    @Optional() private readonly signals?: WorkQueueSignals,
  ) {}

  @Cron('*/10 * * * * *', {
    name: 'file-preview-worker',
    waitForCompletion: true,
    timeZone: 'Asia/Shanghai',
  })
  async pollPendingJobs(): Promise<void> {
    if (!this.poll.ready()) return;
    try { await this.processPendingJobs(); } catch (error) { this.poll.idle(); throw error; }
  }

  processPendingJobs(): Promise<void> {
    if (!this.drain)
      this.drain = this.processBatch().finally(() => {
        this.drain = null;
      });
    return this.drain;
  }

  private async processBatch() {
    for (let i = 0; i < 5; i++) {
      const job = await this.jobs.claimNext();
      if (!job) { this.poll.idle(); return; }
      this.poll.wake();
      let heartbeatRunning = false;
      const heartbeat = setInterval(() => {
        if (heartbeatRunning) return;
        heartbeatRunning = true;
        void this.jobs
          .heartbeat(job)
          .catch((error) => {
            this.logger.warn('file_preview_heartbeat_failed', String(error));
          })
          .finally(() => {
            heartbeatRunning = false;
          });
      }, 30_000);
      heartbeat.unref();
      try {
        await this.processJob(job);
      } catch (error) {
        await this.jobs.fail(job, error);
        this.logger.warn(
          'file_preview_failed',
          JSON.stringify({
            fileId: job.fileId,
            attempts: job.attempts,
            error: error instanceof Error ? error.message : 'Unknown',
          }),
        );
      } finally {
        clearInterval(heartbeat);
      }
    }
  }

  private async processJob(job: ClaimedFilePreviewJob) {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: job.fileId },
      select: { storageKey: true },
    });
    // Cascading deletion removes the job; lease-guarded writes become no-ops.
    if (!file) return;
    await withStoredImage(this.objects, file.storageKey, async (filename) => {
      const image = createImageProcessor(filename);
      const metadata = await image.metadata();
      if (!metadata.width || !metadata.height) throw new Error('Image dimensions are unavailable');
      const thumbnail = await image
        .rotate()
        .resize({ width: 400, height: 400, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      // Immutable source + lease version avoids an expired worker overwriting a newer result.
      const thumbnailStorageKey = `${file.storageKey}/preview/${job.leaseVersion}.jpg`;
      await this.objects.put(thumbnailStorageKey, thumbnail, 'image/jpeg');
      const applied = await this.jobs.complete(job, {
        imageWidth: metadata.autoOrient?.width ?? metadata.width,
        imageHeight: metadata.autoOrient?.height ?? metadata.height,
        thumbnailStorageKey,
        thumbnailSize: thumbnail.length,
      });
      if (!applied) await this.objects.delete(thumbnailStorageKey);
    });
  }
}
