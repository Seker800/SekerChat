import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GroupMemberRole, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { SystemMessageService } from '../messages/system-message.service';
import { PermissionService } from '../system-config/permission.service';
import { GroupMembershipService } from './group-membership.service';
import { resolveGroupUserName } from './group-name';
import { GroupPresenter } from './group-presenter.service';
import { AuthenticatedActor, groupWithMembersSelect } from './group-types';
import { ArchiveGroupApplicationService } from '../group-lifecycle/archive-group-application.service';
import { ServersService } from '../servers/servers.service';

@Injectable()
export class GroupChannelService {
  private readonly logger = new Logger(GroupChannelService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly membershipService: GroupMembershipService,
    private readonly presenter: GroupPresenter,
    private readonly groupRealtimePublisher: GroupRealtimePublisher,
    private readonly systemMessageService: SystemMessageService,
    private readonly archiveGroupApplicationService: ArchiveGroupApplicationService,
    private readonly serversService: ServersService,
  ) {}

  async createGroup(
    actor: AuthenticatedActor,
    name: string,
    serverInput: { serverId?: string; category?: string },
  ) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Group name is required.');
    }

    await this.permissionService.assertPermission(actor.role, 'create_group');

    const server = await this.serversService.resolveServer(serverInput);

    const group = await this.prismaService.group.create({
      data: {
        name: trimmedName,
        serverId: server.id,
        category: server.name,
        createdById: actor.sub,
        members: {
          create: {
            userId: actor.sub,
            role: GroupMemberRole.ADMIN,
          },
        },
      },
      select: groupWithMembersSelect,
    });

    this.logger.log(
      'group_created',
      JSON.stringify({
        actorUserId: actor.sub,
        groupId: group.id,
        name: trimmedName,
        serverId: server.id,
        category: server.name,
      }),
    );

    const creatorName = await resolveGroupUserName(this.prismaService, actor.sub);
    void this.systemMessageService.createSystemMessage(
      group.id,
      actor.sub,
      `${creatorName} 创建了频道`,
    );

    return await this.presenter.serializeGroup(group, actor.sub);
  }

  async updateGroup(
    actor: AuthenticatedActor,
    groupId: string,
    updates: {
      name?: string;
      category?: string;
      serverId?: string;
    },
    getGroup: (userId: string, groupId: string) => Promise<unknown>,
  ) {
    await this.permissionService.assertPermission(actor.role, 'manage_group_settings');

    await this.membershipService.getMembershipOrThrow(groupId, actor.sub);
    await this.membershipService.ensureGroupNotDM(groupId);
    const currentGroup = await this.prismaService.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    if (!currentGroup) {
      throw new NotFoundException('Group not found.');
    }

    const nextData: Prisma.GroupUpdateInput = {
      updatedAt: new Date(),
    };

    const trimmedName = updates.name?.trim();
    if (updates.name !== undefined) {
      if (!trimmedName) {
        throw new BadRequestException('Group name is required.');
      }
      nextData.name = trimmedName;
    }

    if (updates.category !== undefined || updates.serverId !== undefined) {
      const server = await this.serversService.resolveServer({
        serverId: updates.serverId,
        category: updates.category,
      });
      nextData.server = { connect: { id: server.id } };
      nextData.category = server.name;
    }

    if (
      updates.name === undefined &&
      updates.category === undefined &&
      updates.serverId === undefined
    ) {
      throw new BadRequestException('At least one group field must be provided.');
    }

    await this.prismaService.group.update({
      where: { id: groupId },
      data: nextData,
    });

    this.logger.log(
      'group_updated',
      JSON.stringify({
        actorUserId: actor.sub,
        groupId,
        name: trimmedName ?? null,
        category: nextData.category ?? null,
      }),
    );
    await this.groupRealtimePublisher.publishGroupUpdated(groupId);

    return getGroup(actor.sub, groupId);
  }

  async adminJoinGroup(
    actor: AuthenticatedActor,
    groupId: string,
    getGroup: (userId: string, groupId: string) => Promise<unknown>,
  ) {
    await this.permissionService.assertPermission(actor.role, 'join_any_group');

    const group = await this.prismaService.group.findUnique({
      where: { id: groupId },
      select: {
        id: true,
        isDM: true,
        archivedAt: true,
      },
    });

    if (!group) {
      throw new NotFoundException('Group not found.');
    }

    if (group.isDM) {
      throw new BadRequestException('Cannot admin-join a DM group.');
    }

    const existingMembership = await this.prismaService.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: actor.sub,
        },
      },
      select: {
        userId: true,
      },
    });

    if (existingMembership) {
      return getGroup(actor.sub, groupId);
    }

    await this.prismaService.groupMember.create({
      data: {
        groupId,
        userId: actor.sub,
        role: GroupMemberRole.ADMIN,
      },
    });

    await this.prismaService.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });
    this.logger.log(
      'group_admin_self_joined',
      JSON.stringify({
        actorUserId: actor.sub,
        groupId,
      }),
    );
    this.groupRealtimePublisher.invalidateGroupMemberCache(groupId);
    await this.groupRealtimePublisher.publishGroupUpdated(groupId, {
      includeUserIds: [actor.sub],
    });

    const joinerName = await resolveGroupUserName(this.prismaService, actor.sub);
    void this.systemMessageService.createSystemMessage(
      groupId,
      actor.sub,
      `${joinerName} 加入了频道`,
    );

    return getGroup(actor.sub, groupId);
  }

  async archiveGroup(
    actor: AuthenticatedActor,
    groupId: string,
    archive: boolean,
    getGroup: (userId: string, groupId: string) => Promise<unknown>,
  ) {
    await this.permissionService.assertPermission(actor.role, 'archive_group');
    await this.membershipService.getMembershipOrThrow(groupId, actor.sub);
    await this.membershipService.ensureGroupNotDM(groupId);

    const actorName = await resolveGroupUserName(this.prismaService, actor.sub);
    const transition = await this.archiveGroupApplicationService.execute({
      groupId,
      archive,
      reason: 'manual',
      notification: {
        actorUserId: actor.sub,
        text: archive ? `${actorName} 归档了频道` : `${actorName} 取消了归档`,
      },
    });

    this.logger.log(
      archive ? 'group_archived' : 'group_unarchived',
      JSON.stringify({
        actorUserId: actor.sub,
        groupId,
        changed: transition.changed,
      }),
    );

    return getGroup(actor.sub, groupId);
  }

  async markGroupUpdatedFromIntegration(groupId: string): Promise<void> {
    await this.prismaService.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });
    await this.groupRealtimePublisher.publishGroupUpdated(groupId);
  }
}
