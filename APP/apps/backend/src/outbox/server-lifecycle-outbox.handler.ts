import { Injectable } from '@nestjs/common';
import type { OutboxEvent, Prisma } from '@prisma/client';
import { ArchiveGroupApplicationService } from '../group-lifecycle/archive-group-application.service';
import { PrismaService } from '../prisma/prisma.service';
import { WorkStatusConfigService } from '../system-config/work-status-config.service';
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
    private readonly workStatusConfigService: WorkStatusConfigService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    const payload = this.parsePayload(event.payload);
    const archiveStatuses = new Set(
      payload.archive
        ? []
        : (await this.workStatusConfigService.getDefinitions())
            .filter((definition) => definition.isArchive)
            .map((definition) => definition.name),
    );
    const groups = await this.prismaService.group.findMany({
      where: { serverId: payload.serverId, isDM: false },
      orderBy: { id: 'asc' },
      select: { id: true, workState: { select: { status: true } } },
    });

    for (const group of groups) {
      await this.archiveGroupApplicationService.execute({
        groupId: group.id,
        // Restoring a Server must not reopen channels archived by their work status.
        archive: payload.archive || archiveStatuses.has(group.workState?.status ?? ''),
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
