import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { SystemMessageService } from '../messages/system-message.service';
import { OutboxService } from '../outbox/outbox.service';
import { OUTBOX_EVENT_TYPES } from '../outbox/outbox.types';

@Injectable()
export class ArtifactWorkflowService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly systemMessageService: SystemMessageService,
    private readonly groupRealtimePublisher: GroupRealtimePublisher,
    private readonly outboxService: OutboxService,
  ) {}

  async recordArtifactUploaded(
    groupId: string,
    actorUserId: string,
    originalName: string,
  ): Promise<void> {
    await this.prismaService.$transaction((transaction) =>
      this.prepareArtifactUploaded(groupId, actorUserId, originalName, transaction),
    );
  }

  async prepareArtifactUploaded(
    groupId: string,
    actorUserId: string,
    originalName: string,
    transaction: Prisma.TransactionClient,
  ): Promise<void> {
    await this.clearArtifactConfirmation(groupId, transaction);
    await this.outboxService.enqueue(transaction, {
      eventType: OUTBOX_EVENT_TYPES.artifactUploaded,
      aggregateType: 'GroupArtifact',
      aggregateId: groupId,
      payload: { groupId, actorUserId, originalName },
    });
  }

  async recordArtifactDeleted(
    groupId: string,
    actorUserId: string,
    originalName: string,
  ): Promise<void> {
    await this.clearArtifactConfirmation(groupId);
    const actorName = await this.resolveName(actorUserId);
    await this.systemMessageService.createSystemMessage(
      groupId,
      actorUserId,
      `${actorName} 删除了产出「${originalName}」`,
    );
    await this.groupRealtimePublisher.publishGroupUpdated(groupId);
  }

  async recordArtifactsConfirmed(groupId: string, actorUserId: string): Promise<string> {
    const actorName = await this.resolveName(actorUserId);
    await this.systemMessageService.createSystemMessage(
      groupId,
      actorUserId,
      `${actorName} 确认当前产出已就绪`,
    );
    await this.groupRealtimePublisher.publishGroupUpdated(groupId);
    return actorName;
  }

  async recordArtifactsUnlocked(groupId: string, actorUserId: string): Promise<void> {
    const actorName = await this.resolveName(actorUserId);
    await this.clearArtifactConfirmation(groupId);
    await this.systemMessageService.createSystemMessage(
      groupId,
      actorUserId,
      `${actorName} 解除了产出确认`,
    );
    await this.groupRealtimePublisher.publishGroupUpdated(groupId);
  }

  private async resolveName(userId: string): Promise<string> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return user?.displayName || '未知用户';
  }

  private async clearArtifactConfirmation(groupId: string, transaction?: Prisma.TransactionClient) {
    await (transaction ?? this.prismaService).group.update({
      where: { id: groupId },
      data: {
        artifactsConfirmedAt: null,
        artifactsConfirmedByUserId: null,
      },
    });
  }
}
