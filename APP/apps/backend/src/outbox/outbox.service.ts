import { Injectable } from '@nestjs/common';
import { OutboxEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ClaimedOutboxEvent, EnqueueOutboxEvent } from './outbox.types';

@Injectable()
export class OutboxService {
  constructor(private readonly prismaService: PrismaService) {}

  enqueue(transaction: Prisma.TransactionClient, event: EnqueueOutboxEvent) {
    return transaction.outboxEvent.create({ data: event });
  }

  async claimNext(): Promise<ClaimedOutboxEvent | null> {
    return this.prismaService.$transaction(async (transaction) => {
      const [candidate] = await transaction.$queryRaw<ClaimedOutboxEvent[]>(Prisma.sql`
        SELECT *
        FROM "OutboxEvent"
        WHERE
          ("status" = 'PENDING' AND "availableAt" <= CURRENT_TIMESTAMP)
          OR
          ("status" = 'PROCESSING' AND "lockedAt" < CURRENT_TIMESTAMP - INTERVAL '5 minutes')
        ORDER BY "availableAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);
      if (!candidate) return null;

      return transaction.outboxEvent.update({
        where: { id: candidate.id },
        data: {
          status: OutboxEventStatus.PROCESSING,
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lastError: null,
        },
      });
    });
  }

  markProcessed(eventId: string) {
    return this.prismaService.outboxEvent.update({
      where: { id: eventId },
      data: {
        status: OutboxEventStatus.PROCESSED,
        processedAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }

  markFailed(event: ClaimedOutboxEvent, error: unknown) {
    const exhausted = event.attempts >= 12;
    const delaySeconds = Math.min(3600, 2 ** Math.min(event.attempts, 12));
    return this.prismaService.outboxEvent.update({
      where: { id: event.id },
      data: {
        status: exhausted ? OutboxEventStatus.FAILED : OutboxEventStatus.PENDING,
        availableAt: new Date(Date.now() + delaySeconds * 1000),
        lockedAt: null,
        lastError: error instanceof Error ? error.message.slice(0, 2000) : 'Unknown',
      },
    });
  }
}
