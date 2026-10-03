import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, SubscriptionAttachmentStatus, UploadSessionStatus } from '@prisma/client';
import { serializeArtifactStorageKey } from '../artifacts/artifact-storage-key';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { UploadTargetRegistry } from './upload-target-registry';
import { UPLOAD_SESSION_RESUME_WINDOW_MS } from '@sekerchat/shared';

@Injectable()
export class UploadCleanupService {
  private readonly logger = new Logger(UploadCleanupService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly filesService: FilesService,
    private readonly uploadTargets?: UploadTargetRegistry,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'upload-session-cleanup',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  async cleanupExpiredInitiatedUploads() {
    const cutoff = new Date(Date.now() - UPLOAD_SESSION_RESUME_WINDOW_MS);

    let cleanedCount = 0;
    let cursor: string | undefined;

    // Process all stale sessions in batches to avoid unbounded memory,
    // but ensure we eventually cover everything.
    let batchCount = 0;
    const maxBatches = 100; // safety valve: 100k sessions / hour

    do {
      const staleSessions = await this.prismaService.uploadSession.findMany({
        where: {
          status: UploadSessionStatus.INITIATED,
          createdAt: { lt: cutoff },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: {
          id: true,
          objectKey: true,
          multipartUploadId: true,
          subscriptionAttachmentId: true,
          kind: true,
          uploaderId: true,
        },
        take: 100,
        orderBy: { id: 'asc' },
      });

      if (staleSessions.length === 0) break;

      for (const session of staleSessions) {
        try {
          await this.filesService.abortMultipartUpload(
            session.objectKey,
            session.multipartUploadId,
          );
          const abortedAt = new Date();
          const target = this.uploadTargets?.get(session.kind);
          const expired = target?.expireInitiatedSession
            ? await target.expireInitiatedSession(session, abortedAt)
            : (
                await this.prismaService.uploadSession.updateMany({
                  where: { id: session.id, status: UploadSessionStatus.INITIATED },
                  data: {
                    status: UploadSessionStatus.ABORTED,
                    abortedAt,
                  },
                })
              ).count === 1;
          if (!expired) continue;
          if (session.subscriptionAttachmentId) {
            await this.prismaService.subscriptionAttachment.delete({
              where: { id: session.subscriptionAttachmentId },
            });
          }
          cleanedCount += 1;
        } catch (error) {
          this.logger.warn(
            `Failed to cleanup stale upload session ${session.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }

      cursor = staleSessions[staleSessions.length - 1].id;
      batchCount += 1;
    } while (batchCount < maxBatches);

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} stale multipart upload session(s)`);
    }
  }

  @Cron('0 20 3 * * *', {
    name: 'failed-upload-object-cleanup',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  async cleanupExpiredUnreferencedObjects(): Promise<void> {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessions = await this.prismaService.uploadSession.findMany({
      where: {
        status: UploadSessionStatus.FAILED,
        finalizationAttempts: { gte: 10 },
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        objectKey: true,
        multipartUploadId: true,
        subscriptionAttachmentId: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });

    let deletedCount = 0;
    for (const session of sessions) {
      try {
        if (await this.hasDatabaseReference(session.objectKey)) continue;

        if (await this.filesService.hasS3Object(session.objectKey)) {
          if (!(await this.filesService.deleteS3Object(session.objectKey))) {
            throw new Error('Object deletion failed');
          }
        } else {
          try {
            await this.filesService.abortMultipartUpload(session.objectKey, session.multipartUploadId);
          } catch (error) {
            if (!(error instanceof Error && error.name === 'NoSuchUpload')) throw error;
          }
        }
        if (session.subscriptionAttachmentId) {
          await this.prismaService.subscriptionAttachment.deleteMany({
            where: {
              id: session.subscriptionAttachmentId,
              status: SubscriptionAttachmentStatus.UPLOADING,
            },
          });
        } else {
          await this.prismaService.uploadSession.updateMany({
            where: {
              id: session.id,
              status: UploadSessionStatus.FAILED,
            },
            data: {
              status: UploadSessionStatus.ABORTED,
              abortedAt: new Date(),
            },
          });
        }
        deletedCount += 1;
      } catch (error) {
        this.logger.warn(
          'failed_upload_object_cleanup_failed',
          JSON.stringify({
            sessionId: session.id,
            objectKey: session.objectKey,
            error: error instanceof Error ? error.message : 'Unknown',
          }),
        );
      }
    }

    if (deletedCount > 0) {
      this.logger.log(`Deleted ${deletedCount} expired unreferenced upload object(s)`);
    }

    const duplicateSessions = await this.prismaService.uploadSession.findMany({
      where: {
        objectCleanupPending: true,
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        objectKey: true,
        albumPhoto: { select: { storageKey: true } },
      },
      orderBy: { updatedAt: 'asc' },
      take: 100,
    });
    for (const session of duplicateSessions) {
      if (session.albumPhoto && session.objectKey === session.albumPhoto.storageKey) continue;
      if (await this.hasDatabaseReference(session.objectKey)) continue;
      if (await this.filesService.deleteS3Object(session.objectKey)) {
        await this.prismaService.uploadSession.update({
          where: { id: session.id },
          data: { objectCleanupPending: false },
        });
      }
    }
  }

  @Cron('0 50 3 * * *', {
    name: 'terminal-upload-session-cleanup',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  async cleanupTerminalSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const eligible = {
      objectCleanupPending: false,
      AND: [
        { OR: [
          { status: UploadSessionStatus.COMPLETED, completedAt: { lt: cutoff } },
          { status: UploadSessionStatus.ABORTED, abortedAt: { lt: cutoff } },
        ] },
        { OR: [
          { finalizationJob: { is: null } },
          { finalizationJob: { is: { status: { in: ['COMPLETED', 'FAILED'] } } } },
        ] },
      ],
    } satisfies Prisma.UploadSessionWhereInput;
    let removed = 0;
    for (let batch = 0; batch < 100; batch += 1) {
      const rows = await this.prismaService.uploadSession.findMany({
        where: eligible,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 100,
      });
      if (!rows.length) break;
      const result = await this.prismaService.uploadSession.deleteMany({
        where: { AND: [eligible, { id: { in: rows.map((row) => row.id) } }] },
      });
      removed += result.count;
      if (rows.length < 100 || result.count === 0) break;
    }
    if (removed) this.logger.log(`Removed ${removed} terminal upload session(s)`);
  }

  private async hasDatabaseReference(objectKey: string): Promise<boolean> {
    const [file, artifact, subscriptionAttachment, albumPhoto] = await Promise.all([
      this.prismaService.fileObject.findFirst({
        where: { storageKey: objectKey },
        select: { id: true },
      }),
      this.prismaService.groupArtifact.findFirst({
        where: { relativePath: serializeArtifactStorageKey(objectKey) },
        select: { id: true },
      }),
      this.prismaService.subscriptionAttachment.findFirst({
        where: {
          storageKey: objectKey,
          status: SubscriptionAttachmentStatus.READY,
        },
        select: { id: true },
      }),
      this.prismaService.albumPhoto?.findFirst({
        where: { OR: [{ storageKey: objectKey }, { thumbnailStorageKey: objectKey }] },
        select: { id: true },
      }) ?? Promise.resolve(null),
    ]);
    return Boolean(file || artifact || subscriptionAttachment || albumPhoto);
  }
}
