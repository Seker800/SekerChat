import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ClaimedFilePreviewJob } from './file-preview-state';

@Injectable()
export class FilePreviewJobService {
  constructor(private readonly prisma: PrismaService) {}

  async claimNext(): Promise<ClaimedFilePreviewJob | null> {
    const rows = await this.prisma.$queryRaw<ClaimedFilePreviewJob[]>(Prisma.sql`
      WITH expired AS (
        UPDATE "FilePreviewJob" SET "status" = 'FAILED', "lockedAt" = NULL,
          "lastError" = 'Image worker repeatedly stopped before completion', "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
        WHERE "status" = 'PROCESSING' AND "attempts" >= 5
          AND "lockedAt" < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '5 minutes'
      )
      UPDATE "FilePreviewJob" SET "status" = 'PROCESSING', "lockedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
        "attempts" = "attempts" + 1, "leaseVersion" = "leaseVersion" + 1, "updatedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      WHERE "fileId" = (
        SELECT "fileId" FROM "FilePreviewJob"
        WHERE ("status" = 'PENDING' AND "availableAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))
          OR ("status" = 'PROCESSING' AND "attempts" < 5 AND "lockedAt" < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '5 minutes')
        ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1
      ) RETURNING "fileId", "attempts", "leaseVersion"
    `);
    return rows[0] ?? null;
  }

  private lease(job: ClaimedFilePreviewJob) {
    return { fileId: job.fileId, leaseVersion: job.leaseVersion, status: 'PROCESSING' };
  }

  async heartbeat(job: ClaimedFilePreviewJob) {
    return (
      (
        await this.prisma.filePreviewJob.updateMany({
          where: this.lease(job),
          data: { lockedAt: new Date() },
        })
      ).count === 1
    );
  }

  async complete(
    job: ClaimedFilePreviewJob,
    metadata: {
      imageWidth: number;
      imageHeight: number;
      thumbnailStorageKey?: string;
      thumbnailSize?: number;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const owned = await tx.filePreviewJob.updateMany({
        where: this.lease(job),
        data: { status: 'READY', lockedAt: null, lastError: null },
      });
      if (!owned.count) return false;
      await tx.fileObject.update({ where: { id: job.fileId }, data: metadata });
      return true;
    });
  }

  async fail(job: ClaimedFilePreviewJob, error: unknown) {
    await this.prisma.filePreviewJob.updateMany({
      where: this.lease(job),
      data: {
        status: job.attempts >= 5 ? 'FAILED' : 'PENDING',
        availableAt: new Date(Date.now() + Math.min(3600, 2 ** job.attempts * 10) * 1000),
        lockedAt: null,
        lastError:
          error instanceof Error ? error.message.slice(0, 2000) : 'Unknown image processing error',
      },
    });
  }
}
