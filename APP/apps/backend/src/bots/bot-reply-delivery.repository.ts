import { Injectable } from '@nestjs/common';
import { BotReplyDeliveryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type BotReplyClaim =
  | { state: 'ACQUIRED' }
  | { state: 'GENERATED'; responseText: string }
  | { state: 'TERMINAL' };

@Injectable()
export class BotReplyDeliveryRepository {
  constructor(private readonly prismaService: PrismaService) {}

  async claim(botUserId: string, groupId: string, sourceEventId: string): Promise<BotReplyClaim> {
    const created = await this.prismaService.botReplyDelivery.createMany({
      data: {
        botUserId,
        groupId,
        sourceEventId,
        status: BotReplyDeliveryStatus.CLAIMED,
      },
      skipDuplicates: true,
    });
    if (created.count === 1) {
      return { state: 'ACQUIRED' };
    }

    const existing = await this.prismaService.botReplyDelivery.findUniqueOrThrow({
      where: { botUserId_sourceEventId: { botUserId, sourceEventId } },
      select: { status: true, responseText: true },
    });
    if (existing.status === BotReplyDeliveryStatus.GENERATED && existing.responseText) {
      return { state: 'GENERATED', responseText: existing.responseText };
    }
    return { state: 'TERMINAL' };
  }

  async storeGenerated(
    botUserId: string,
    sourceEventId: string,
    responseText: string,
  ): Promise<void> {
    const updated = await this.prismaService.botReplyDelivery.updateMany({
      where: {
        botUserId,
        sourceEventId,
        status: BotReplyDeliveryStatus.CLAIMED,
      },
      data: {
        status: BotReplyDeliveryStatus.GENERATED,
        responseText,
        lastError: null,
      },
    });
    if (updated.count !== 1) {
      throw new Error('Bot reply delivery claim was lost before generation was persisted.');
    }
  }

  async markCompleted(botUserId: string, sourceEventId: string): Promise<void> {
    await this.prismaService.botReplyDelivery.updateMany({
      where: {
        botUserId,
        sourceEventId,
        status: {
          in: [BotReplyDeliveryStatus.CLAIMED, BotReplyDeliveryStatus.GENERATED],
        },
      },
      data: {
        status: BotReplyDeliveryStatus.COMPLETED,
        completedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markAmbiguous(botUserId: string, sourceEventId: string, error: unknown): Promise<void> {
    await this.prismaService.botReplyDelivery.updateMany({
      where: {
        botUserId,
        sourceEventId,
        status: BotReplyDeliveryStatus.CLAIMED,
      },
      data: {
        status: BotReplyDeliveryStatus.AMBIGUOUS,
        lastError: String(error).slice(0, 2000),
      },
    });
  }
}
