import { ForbiddenException, Injectable } from '@nestjs/common';
import { ArchiveGroupApplicationService } from '../group-lifecycle/archive-group-application.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../system-config/permission.service';
import { WorkStatusConfigService } from '../system-config/work-status-config.service';

type SetGroupWorkStateInput = {
  status: string;
  reason?: string;
  sourceMessageIds?: string[];
};

type OpsWriteOptions = {
  actorType?: string;
};

@Injectable()
export class OpsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly workStatusConfigService: WorkStatusConfigService,
    private readonly archiveGroupApplicationService: ArchiveGroupApplicationService,
  ) {}

  async getGroupWorkState(userId: string, groupId: string) {
    await this.getGroupMembershipOrThrow(groupId, userId);

    const state = await this.prismaService.groupWorkState.findUnique({
      where: { groupId },
    });

    return state
      ? {
          ...state,
          status: state.status,
        }
      : {
          id: null,
          groupId,
          status: '初始',
          reason: null,
          sourceMessageIds: [],
          updatedByActorType: null,
          updatedByActorId: null,
          createdAt: null,
          updatedAt: null,
        };
  }

  async getGroupWorkStateHistory(userId: string, groupId: string) {
    await this.getGroupMembershipOrThrow(groupId, userId);

    const records = await this.prismaService.groupWorkStateHistory.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const userIds = [...new Set(records.map((r) => r.actorId))];
    const users = await this.prismaService.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, displayName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    return records.map((r) => ({
      ...r,
      actor: r.actorType === 'human_user' ? (userMap.get(r.actorId) ?? null) : null,
    }));
  }

  async setGroupWorkState(
    actor: { sub: string; role: string },
    groupId: string,
    input: SetGroupWorkStateInput,
    options?: OpsWriteOptions,
  ) {
    await this.permissionService.assertPermission(actor.role, 'manage_work_status');

    await this.getGroupMembershipOrThrow(groupId, actor.sub);

    const normalizedReason = input.reason?.trim() || null;
    const sourceMessageIds = this.normalizeStringArray(input.sourceMessageIds);
    const previousState = await this.prismaService.groupWorkState.findUnique({
      where: { groupId },
      select: {
        status: true,
      },
    });

    const shouldArchive = await this.workStatusConfigService.isArchiveStatus(input.status);
    const actorName = await this.resolveName(actor.sub);
    const statusChanged = previousState?.status !== input.status;
    const result = await this.prismaService.$transaction(async (transaction) => {
      const state = await transaction.groupWorkState.upsert({
        where: { groupId },
        update: {
          status: input.status,
          reason: normalizedReason,
          sourceMessageIds,
          updatedByActorType: options?.actorType ?? 'human_user',
          updatedByActorId: actor.sub,
        },
        create: {
          groupId,
          status: input.status,
          reason: normalizedReason,
          sourceMessageIds,
          updatedByActorType: options?.actorType ?? 'human_user',
          updatedByActorId: actor.sub,
        },
      });

      await transaction.groupWorkStateHistory.create({
        data: {
          groupId,
          fromStatus: previousState?.status ?? null,
          toStatus: input.status,
          reason: normalizedReason,
          sourceMessageIds,
          actorType: options?.actorType ?? 'human_user',
          actorId: actor.sub,
        },
      });

      const fromPart = previousState?.status ? `从 ${previousState.status} ` : '';
      const statusMessage = `${actorName} 将工作状态${fromPart}改为 ${input.status}`;
      await this.archiveGroupApplicationService.execute(
        {
          groupId,
          archive: shouldArchive,
          reason: 'work-status',
          notifyWhenUnchanged: statusChanged,
          notification: {
            actorUserId: actor.sub,
            text: statusMessage,
            textWhenStateChanges: `${statusMessage}${shouldArchive ? '（频道已自动归档）' : '（频道已自动取消归档）'}`,
          },
        },
        transaction,
      );

      return {
        ...state,
        status: state.status,
      };
    });

    return result;
  }

  private async resolveName(userId: string): Promise<string> {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return user?.displayName || '未知用户';
  }

  private async getGroupMembershipOrThrow(groupId: string, userId: string) {
    const membership = await this.prismaService.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      select: {
        groupId: true,
        role: true,
      },
    });

    if (!membership) {
      // SUPER_ADMIN bypass
      const user = await this.prismaService.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (user?.role === 'SUPER_ADMIN') {
        return { groupId, role: 'MEMBER' as const };
      }
      throw new ForbiddenException('Group access denied.');
    }

    return membership;
  }

  private normalizeStringArray(values?: string[]) {
    return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
  }
}
