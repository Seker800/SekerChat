import { Injectable } from '@nestjs/common';
import { AlbumMediaJobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ClaimedAlbumMediaJob {
  id: string;
  photoId: string;
  kind: 'GENERATE_THUMBNAIL' | 'HASH_CONTENT' | 'PURGE_PHOTO';
  attempts: number;
}

@Injectable()
export class AlbumMediaJobService {
  constructor(private readonly prisma: PrismaService) {}

  async claimNext(): Promise<ClaimedAlbumMediaJob | null> {
    return this.prisma.$transaction(async (transaction) => {
      const [candidate] = await transaction.$queryRaw<ClaimedAlbumMediaJob[]>(Prisma.sql`
        SELECT "id", "photoId", "kind", "attempts"
        FROM "AlbumMediaJob"
        WHERE
          ("status" = 'PENDING' AND "availableAt" <= CURRENT_TIMESTAMP)
          OR
          ("status" = 'PROCESSING' AND "lockedAt" < CURRENT_TIMESTAMP - INTERVAL '10 minutes')
        ORDER BY
          CASE "kind"
            WHEN 'GENERATE_THUMBNAIL' THEN 0
            WHEN 'PURGE_PHOTO' THEN 1
            WHEN 'HASH_CONTENT' THEN 2
            ELSE 3
          END,
          "availableAt" ASC,
          "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      if (!candidate) return null;
      return transaction.albumMediaJob.update({
        where: { id: candidate.id },
        data: {
          status: AlbumMediaJobStatus.PROCESSING,
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lastError: null,
        },
      }) as Promise<ClaimedAlbumMediaJob>;
    });
  }

  markCompleted(jobId: string) {
    return this.prisma.albumMediaJob.delete({
      where: { id: jobId },
    });
  }

  markFailed(job: ClaimedAlbumMediaJob, error: unknown) {
    const exhausted = job.attempts >= 12;
    const delaySeconds = Math.min(3_600, 2 ** Math.min(job.attempts, 12));
    return this.prisma.albumMediaJob.update({
      where: { id: job.id },
      data: {
        status: exhausted ? AlbumMediaJobStatus.FAILED : AlbumMediaJobStatus.PENDING,
        ...(exhausted ? {} : { availableAt: new Date(Date.now() + delaySeconds * 1_000) }),
        lockedAt: null,
        lastError: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown',
      },
    });
  }
}
