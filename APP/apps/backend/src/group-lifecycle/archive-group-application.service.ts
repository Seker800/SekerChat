import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OutboxService } from '../outbox/outbox.service';
import { OUTBOX_EVENT_TYPES } from '../outbox/outbox.types';
import { PrismaService } from '../prisma/prisma.service';

export type ArchiveGroupReason = 'manual' | 'work-status' | 'server' | 'last-member';

export type ArchiveGroupCommand = {
  groupId: string;
  archive: boolean;
  reason: ArchiveGroupReason;
  notification?: {
    actorUserId: string;
    text: string;
    textWhenStateChanges?: string;
  };
  notifyWhenUnchanged?: boolean;
};

@Injectable()
export class ArchiveGroupApplicationService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  execute(command: ArchiveGroupCommand, transaction?: Prisma.TransactionClient) {
    if (transaction) return this.executeInTransaction(transaction, command);
    return this.prismaService.$transaction((tx) => this.executeInTransaction(tx, command));
  }

  private async executeInTransaction(
    transaction: Prisma.TransactionClient,
    command: ArchiveGroupCommand,
  ) {
    const changedAt = new Date();
    const changed = await transaction.group.updateMany({
      where: {
        id: command.groupId,
        isDM: false,
        archivedAt: command.archive ? null : { not: null },
      },
      data: {
        archivedAt: command.archive ? changedAt : null,
        updatedAt: changedAt,
      },
    });

    if (command.archive && changed.count > 0) {
      await transaction.fileShare.updateMany({
        where: {
          file: { groupId: command.groupId },
          OR: [{ revokedReason: null }, { revokedReason: { not: 'CHANNEL_ARCHIVED' } }],
        },
        data: {
          revokedAt: changedAt,
          revokedReason: 'CHANNEL_ARCHIVED',
        },
      });
    }

    if (!command.archive && command.reason === 'manual' && changed.count > 0) {
      await transaction.groupWorkState.deleteMany({ where: { groupId: command.groupId } });
    }

    if (changed.count > 0 || command.notifyWhenUnchanged) {
      const notification = command.notification
        ? {
            actorUserId: command.notification.actorUserId,
            text:
              changed.count > 0 && command.notification.textWhenStateChanges
                ? command.notification.textWhenStateChanges
                : command.notification.text,
          }
        : null;
      await this.outboxService.enqueue(transaction, {
        eventType: OUTBOX_EVENT_TYPES.groupLifecycleChanged,
        aggregateType: 'Group',
        aggregateId: command.groupId,
        payload: {
          groupId: command.groupId,
          archive: command.archive,
          reason: command.reason,
          notification,
        },
      });
    }

    return {
      changed: changed.count > 0,
      archivedAt: command.archive && changed.count > 0 ? changedAt : null,
    };
  }
}
