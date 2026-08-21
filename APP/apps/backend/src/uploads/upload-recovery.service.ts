import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, UploadSessionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from './uploads.service';

@Injectable()
export class UploadRecoveryService {
  private readonly logger = new Logger(UploadRecoveryService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly uploadsService: UploadsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, {
    name: 'upload-finalization-recovery',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  async recoverPendingFinalizations(): Promise<void> {
    const staleInitiatedCutoff = new Date(Date.now() - 60_000);
    const staleFinalizingCutoff = new Date(Date.now() - 5 * 60_000);
    await this.prismaService.uploadSession.updateMany({
      where: {
        status: UploadSessionStatus.FINALIZING,
        finalizationStartedAt: { lt: staleFinalizingCutoff },
      },
      data: {
        status: UploadSessionStatus.FAILED,
        lastError: 'Finalization lease expired before completion.',
      },
    });
    const sessions = await this.prismaService.uploadSession.findMany({
      where: {
        finalizationAttempts: { lt: 10 },
        OR: [
          {
            status: {
              in: [UploadSessionStatus.ASSEMBLED, UploadSessionStatus.FAILED],
            },
          },
          {
            status: UploadSessionStatus.INITIATED,
            completionParts: { not: Prisma.DbNull },
            updatedAt: { lt: staleInitiatedCutoff },
          },
        ],
      },
      select: { id: true },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });

    for (const session of sessions) {
      try {
        await this.uploadsService.recoverUploadSession(session.id);
      } catch (error) {
        this.logger.warn(
          'upload_finalization_recovery_failed',
          JSON.stringify({
            sessionId: session.id,
            error: error instanceof Error ? error.message : 'Unknown',
          }),
        );
      }
    }
  }
}
