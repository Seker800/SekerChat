import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MessageType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { RetentionConfigService } from '../system-config/retention-config.service';

type FileKind = 'image' | 'file';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly retentionConfigService: RetentionConfigService,
    private readonly filesService: FilesService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'message-retention',
    timeZone: 'Asia/Shanghai',
    waitForCompletion: true,
  })
  async enforceRetention() {
    const config = await this.retentionConfigService.getPolicy();

    if (config.schedule === 'manual') {
      this.logger.log('Retention schedule is manual, skipping');
      return;
    }

    if (config.schedule === 'weekly') {
      const dayOfWeek = new Date().getDay();
      if (dayOfWeek !== 0) {
        this.logger.log(`Retention schedule is weekly, skipping (today is day ${dayOfWeek})`);
        return;
      }
    }

    this.logger.log('Retention check started (Asia/Shanghai)');

    if (config.textRetentionDays > 0) {
      await this.enforceTextRetention(config.textRetentionDays);
    }

    if (config.imageRetentionDays > 0) {
      await this.enforceAttachmentDayRetention('image', config.imageRetentionDays);
    }
    if (config.fileRetentionDays > 0) {
      await this.enforceAttachmentDayRetention('file', config.fileRetentionDays);
    }

    if (config.imageRetentionSizeGB > 0) {
      await this.enforceAttachmentSizeRetention('image', config.imageRetentionSizeGB);
    }
    if (config.fileRetentionSizeGB > 0) {
      await this.enforceAttachmentSizeRetention('file', config.fileRetentionSizeGB);
    }

    await this.purgeOrphanedFiles();

    this.logger.log('Retention check complete');
  }

  private async purgeOrphanedFiles() {
    const orphans = await this.prisma.$queryRaw<
      Array<{ id: string; storageKey: string; thumbnailStorageKey: string | null }>
    >`
      SELECT f.id, f."storageKey", f."thumbnailStorageKey"
      FROM "FileObject" f
      LEFT JOIN "Message" m ON m."attachmentFileId" = f.id
      LEFT JOIN "FileShare" fs ON fs."fileId" = f.id
      LEFT JOIN "Group" g ON g.id = f."groupId"
      WHERE m.id IS NULL
        AND f."attachedAt" IS NOT NULL
        AND NOT (
          fs.id IS NOT NULL
          AND fs."revokedAt" IS NULL
          AND fs."expiresAt" > NOW()
          AND g."archivedAt" IS NULL
        )
    `;

    if (orphans.length === 0) return;

    this.logger.log(`Found ${orphans.length} orphaned FileObjects to purge`);

    const results = await Promise.all(
      orphans.map(async (file) => {
        if (!file.storageKey) {
          this.logger.warn(`Orphaned FileObject ${file.id} has empty storageKey, skipping`);
          return { id: file.id, ok: false };
        }
        const deletedOriginal = await this.filesService.deleteS3Object(file.storageKey);
        const deletedThumbnail = file.thumbnailStorageKey
          ? await this.filesService.deleteS3Object(file.thumbnailStorageKey)
          : true;
        return { id: file.id, ok: deletedOriginal && deletedThumbnail };
      }),
    );

    const deletedFileIds = results.filter((r) => r.ok).map((r) => r.id);

    if (deletedFileIds.length === 0) {
      this.logger.warn(
        'No orphaned file records were removed because backing objects could not be deleted',
      );
      return;
    }

    try {
      await this.retryDbDelete(deletedFileIds);
    } catch (error) {
      this.logger.error(
        `CRITICAL: DB deleteMany failed after S3 objects were already deleted. Orphaned FileObject IDs still in DB: ${deletedFileIds.join(', ')}`,
        error instanceof Error ? error.stack : error,
      );
      return;
    }

    const skippedCount = orphans.length - deletedFileIds.length;
    this.logger.log(
      `Purged ${deletedFileIds.length} orphaned FileObjects with S3 cleanup${skippedCount > 0 ? `, skipped ${skippedCount}` : ''}`,
    );
  }

  private async enforceTextRetention(days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const deleted = await this.prisma.message.deleteMany({
      where: {
        createdAt: { lt: cutoff },
        type: MessageType.TEXT,
      },
    });

    if (deleted.count > 0) {
      this.logger.log(
        `Retention (text days=${days}): deleted ${deleted.count} messages older than ${cutoff.toISOString()}`,
      );
    }
  }

  private async enforceAttachmentDayRetention(kind: FileKind, days: number) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const targetType = this.getMessageTypeForKind(kind);

    const messages = await this.prisma.message.findMany({
      where: {
        createdAt: { lt: cutoff },
        type: targetType,
        attachmentFileId: { not: null },
      },
      select: {
        id: true,
        attachmentFileId: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    if (!messages.length) return;

    await this.detachAttachments(
      messages.map((message) => message.id),
      messages.flatMap((message) => (message.attachmentFileId ? [message.attachmentFileId] : [])),
    );
    this.logger.log(
      `Retention (${kind} days=${days}): detached ${messages.length} attachments older than ${cutoff.toISOString()}`,
    );
  }

  private async enforceAttachmentSizeRetention(kind: FileKind, sizeGB: number) {
    const maxBytes = BigInt(sizeGB) * 1024n * 1024n * 1024n;
    const targetType = this.getMessageTypeForKind(kind);

    const [totalRow] = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COALESCE(SUM(COALESCE(f."size", 0) + COALESCE(f."thumbnailSize", 0)), 0) AS total
      FROM "FileObject" f
      WHERE f.id IN (
        SELECT DISTINCT m."attachmentFileId"
        FROM "Message" m
        WHERE m."type" = ${targetType}
          AND m."attachmentFileId" IS NOT NULL
      )
    `;

    const totalBytes = totalRow?.total ?? 0n;
    if (totalBytes <= maxBytes) return;

    const files = await this.prisma.$queryRaw<Array<{ file_id: string; file_bytes: bigint }>>`
      SELECT f.id AS file_id,
             COALESCE(f."size", 0) + COALESCE(f."thumbnailSize", 0) AS file_bytes
      FROM "FileObject" f
      WHERE f.id IN (
        SELECT DISTINCT m."attachmentFileId"
        FROM "Message" m
        WHERE m."type" = ${targetType}
          AND m."attachmentFileId" IS NOT NULL
      )
      ORDER BY f."attachedAt" ASC NULLS FIRST, f.id ASC
    `;

    const fileIdsToDetach: string[] = [];
    let freed = 0n;
    const excessBytes = totalBytes - maxBytes;

    for (const file of files) {
      fileIdsToDetach.push(file.file_id);
      freed += file.file_bytes;
      if (freed >= excessBytes) break;
    }

    if (!fileIdsToDetach.length) return;

    const messageIds = await this.listMessageIdsByAttachmentFileIds(fileIdsToDetach, targetType);
    await this.detachAttachments(messageIds, fileIdsToDetach);

    this.logger.log(
      `Retention (${kind} sizeGB=${sizeGB}): detached ${fileIdsToDetach.length} file objects across ${messageIds.length} messages, freed ~${Number(freed / 1024n / 1024n)} MB`,
    );
  }

  private getMessageTypeForKind(kind: FileKind): MessageType {
    return kind === 'image' ? MessageType.IMAGE : MessageType.FILE;
  }

  private async listMessageIdsByAttachmentFileIds(fileIds: string[], type: MessageType) {
    if (!fileIds.length) return [];

    const messages = await this.prisma.message.findMany({
      where: {
        type,
        attachmentFileId: { in: fileIds },
      },
      select: {
        id: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    return messages.map((message) => message.id);
  }

  private async detachAttachments(messageIds: string[], fileIds: string[]) {
    if (!messageIds.length) return;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.message.updateMany({
        where: { id: { in: messageIds } },
        data: {
          attachmentFileId: null,
          text: '该附件已过期回收',
        },
      });

      if (fileIds.length > 0) {
        await transaction.fileShare.deleteMany({
          where: {
            fileId: { in: [...new Set(fileIds)] },
            file: { messages: { none: {} } },
          },
        });
      }
    });
  }

  private async retryDbDelete(fileIds: string[], maxRetries = 3): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await this.prisma.fileObject.deleteMany({
          where: { id: { in: fileIds } },
        });
        return;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastError;
  }
}
