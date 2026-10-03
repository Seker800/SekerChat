import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OutboxEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const BATCH_SIZE = 100;
const PROCESSED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const FAILED_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
const DEAD_LETTER_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

@Injectable()
export class OutboxRetentionService {
  private readonly logger = new Logger(OutboxRetentionService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 30 3 * * *', { name: 'outbox-retention', timeZone: 'Asia/Shanghai', waitForCompletion: true })
  async cleanup(): Promise<void> {
    const failedCount = await this.prisma.outboxEvent.count({
      where: { status: OutboxEventStatus.FAILED },
    });
    if (failedCount) this.logger.warn(`${failedCount} failed outbox event(s) require review`);

    const processedBefore = new Date(Date.now() - PROCESSED_RETENTION_MS);
    const failedBefore = new Date(Date.now() - FAILED_RETENTION_MS);
    const eligible = { status: OutboxEventStatus.PROCESSED, processedAt: { lt: processedBefore } };
    let removed = 0;
    for (let batch = 0; batch < 100; batch += 1) {
      const rows = await this.prisma.outboxEvent.findMany({
        where: eligible,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });
      if (!rows.length) break;
      const result = await this.prisma.outboxEvent.deleteMany({
        where: { AND: [eligible, { id: { in: rows.map((row) => row.id) } }] },
      });
      removed += result.count;
      if (rows.length < BATCH_SIZE || result.count === 0) break;
    }
    if (removed) this.logger.log(`Removed ${removed} terminal outbox event(s)`);

    let archived = 0;
    for (let batch = 0; batch < 100; batch += 1) {
      const result = await this.prisma.$transaction(async (tx) => {
        const failed = await tx.outboxEvent.findMany({
          where: { status: OutboxEventStatus.FAILED, updatedAt: { lt: failedBefore } },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
        });
        if (!failed.length) return { scanned: 0, removed: 0 };
        await tx.outboxDeadLetter.createMany({
          data: failed.map((event) => ({
            sourceEventId: event.id,
            eventType: event.eventType,
            aggregateType: event.aggregateType,
            aggregateId: event.aggregateId,
            payload: event.payload === null ? Prisma.JsonNull : event.payload as Prisma.InputJsonValue,
            attempts: event.attempts,
            lastError: event.lastError,
            failedAt: event.updatedAt,
          })),
          skipDuplicates: true,
        });
        const deleted = await tx.outboxEvent.deleteMany({
          where: { id: { in: failed.map((event) => event.id) }, status: OutboxEventStatus.FAILED, updatedAt: { lt: failedBefore } },
        });
        return { scanned: failed.length, removed: deleted.count };
      });
      archived += result.removed;
      if (result.scanned < BATCH_SIZE || result.removed === 0) break;
    }
    if (archived) this.logger.warn(`Archived ${archived} exhausted outbox event(s) for manual review`);

    const archivedBefore = new Date(Date.now() - DEAD_LETTER_RETENTION_MS);
    let purged = 0;
    for (let batch = 0; batch < 100; batch += 1) {
      const rows = await this.prisma.outboxDeadLetter.findMany({
        where: { archivedAt: { lt: archivedBefore } },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      });
      if (!rows.length) break;
      const result = await this.prisma.outboxDeadLetter.deleteMany({
        where: { id: { in: rows.map((row) => row.id) }, archivedAt: { lt: archivedBefore } },
      });
      purged += result.count;
      if (rows.length < BATCH_SIZE || result.count === 0) break;
    }
    if (purged) this.logger.log(`Removed ${purged} expired outbox dead letter(s)`);
  }
}
