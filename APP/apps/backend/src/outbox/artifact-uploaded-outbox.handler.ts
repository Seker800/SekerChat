import { Injectable } from '@nestjs/common';
import type { OutboxEvent, Prisma } from '@prisma/client';
import { SystemMessageService } from '../messages/system-message.service';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { OUTBOX_EVENT_TYPES, type ArtifactUploadedPayload } from './outbox.types';

@Injectable()
export class ArtifactUploadedOutboxHandler {
  readonly eventType = OUTBOX_EVENT_TYPES.artifactUploaded;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly systemMessageService: SystemMessageService,
    private readonly groupRealtimePublisher: GroupRealtimePublisher,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const payload = this.parsePayload(event.payload);
    const actor = await this.prismaService.user.findUnique({
      where: { id: payload.actorUserId },
      select: { displayName: true },
    });
    await this.systemMessageService.createSystemMessage(
      payload.groupId,
      payload.actorUserId,
      `${actor?.displayName || '未知用户'} 上传了产出「${payload.originalName}」`,
      event.id,
    );
    await this.groupRealtimePublisher.publishGroupUpdated(payload.groupId);
  }

  private parsePayload(payload: Prisma.JsonValue): ArtifactUploadedPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof payload.groupId !== 'string' ||
      typeof payload.actorUserId !== 'string' ||
      typeof payload.originalName !== 'string'
    ) {
      throw new Error('Invalid artifact.uploaded.v1 outbox payload.');
    }
    return {
      groupId: payload.groupId,
      actorUserId: payload.actorUserId,
      originalName: payload.originalName,
    };
  }
}
