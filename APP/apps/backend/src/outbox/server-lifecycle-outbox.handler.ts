import { Injectable } from '@nestjs/common';
import type { OutboxEvent, Prisma } from '@prisma/client';
import { ArchiveGroupApplicationService } from '../group-lifecycle/archive-group-application.service';
import { PrismaService } from '../prisma/prisma.service';
import { OUTBOX_EVENT_TYPES } from './outbox.types';

type ServerLifecyclePayload = {
  serverId: string;
  archive: boolean;
};

@Injectable()
export class ServerLifecycleOutboxHandler {
  readonly eventType = OUTBOX_EVENT_TYPES.serverLifecycleRequested;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly archiveGroupApplicationService: ArchiveGroupApplicationService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const payload = this.parsePayload(event.payload);
    const groups = await this.prismaService.group.findMany({
      where: { serverId: payload.serverId, isDM: false },
      orderBy: { id: 'asc' },
      select: { id: true },
    });

    for (const group of groups) {
      await this.archiveGroupApplicationService.execute({
        groupId: group.id,
        archive: payload.archive,
        reason: 'server',
      });
    }
  }

  private parsePayload(payload: Prisma.JsonValue): ServerLifecyclePayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload) ||
      typeof payload.serverId !== 'string' ||
      typeof payload.archive !== 'boolean'
    ) {
      throw new Error('Invalid server.lifecycle.requested.v1 outbox payload.');
    }
    return { serverId: payload.serverId, archive: payload.archive };
  }
}
