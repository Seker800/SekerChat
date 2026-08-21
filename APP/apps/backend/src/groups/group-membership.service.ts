import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GroupMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { SystemMessageService } from '../messages/system-message.service';
import { PermissionService } from '../system-config/permission.service';
import { resolveGroupUserNames } from './group-name';
import { AuthenticatedActor } from './group-types';
import { ArchiveGroupApplicationService } from '../group-lifecycle/archive-group-application.service';

@Injectable()
export class GroupMembershipService {
  private readonly logger = new Logger(GroupMembershipService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly groupRealtimePublisher: GroupRealtimePublisher,
    private readonly systemMessageService: SystemMessageService,
    private readonly archiveGroupApplicationService: ArchiveGroupApplicationService,
  ) {}

  async getMembershipOrThrow(groupId: string, userId: string) {
    const membership = await this.prismaService.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      select: {
        userId: true,
        role: true,
      },
    });

    if (!membership) {
      this.logger.warn(
        'group_access_denied',
        JSON.stringify({
          userId,
          groupId,
        }),
      );
      throw new ForbiddenException('Group access denied.');
    }

    return membership;
  }

  async ensureGroupNotDM(groupId: string): Promise<void> {
    const group = await this.prismaService.group.findUnique({
      where: { id: groupId },
      select: { isDM: true },
    });

    if (group?.isDM) {
      throw new BadRequestException('This operation is not allowed for DM groups.');
    }
  }

  assertGroupNotArchived(archivedAt: Date | null): void {
    if (archivedAt) {
      this.logger.warn('group_write_denied_archived', JSON.stringify({ archivedAt }));
      throw new BadRequestException('Archived group is read-only.');
    }
  }

  async assertGroupReadable(groupId: string, userId: string): Promise<void> {
    await this.getMembershipOrThrow(groupId, userId);
  }

  async inviteMember(
    actor: AuthenticatedActor,
    groupId: string,
    email: string,
    getGroup: (userId: string, groupId: string) => Promise<unknown>,
  ) {
    await this.permissionService.assertPermission(actor.role, 'invite_members');
    await this.getMembershipOrThrow(groupId, actor.sub);
    await this.ensureGroupNotDM(groupId);

    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prismaService.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Invite target user not found.');
    }

    const existingMembership = await this.prismaService.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      throw new BadRequestException('User is already a group member.');
    }

    await this.prismaService.$transaction([
      this.prismaService.groupMember.create({
        data: {
          groupId,
          userId: user.id,
          role: GroupMemberRole.MEMBER,
        },
      }),
      this.prismaService.group.update({
        where: { id: groupId },
        data: { updatedAt: new Date() },
      }),
    ]);
    this.logger.log(
      'group_member_invited',
      JSON.stringify({
        actorUserId: actor.sub,
        groupId,
        targetUserId: user.id,
      }),
    );
    this.groupRealtimePublisher.invalidateGroupMemberCache(groupId);
    await this.groupRealtimePublisher.publishGroupUpdated(groupId);

    const [actorName, targetName] = await resolveGroupUserNames(this.prismaService, [actor.sub, user.id]);
    void this.systemMessageService.createSystemMessage(groupId, actor.sub, `${actorName} 邀请了 ${targetName} 加入频道`);

    return getGroup(actor.sub, groupId);
  }

  async removeMember(
    actor: AuthenticatedActor,
    groupId: string,
    targetUserId: string,
    getGroup: (userId: string, groupId: string) => Promise<unknown>,
  ) {
    await this.permissionService.assertPermission(actor.role, 'remove_members');
    const membership = await this.getMembershipOrThrow(groupId, actor.sub);
    await this.ensureGroupNotDM(groupId);

    const targetMembership = await this.prismaService.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMembership) {
      throw new NotFoundException('Group member not found.');
    }

    if (targetUserId === actor.sub) {
      throw new BadRequestException('Cannot remove yourself. Use leave group instead.');
    }

    await this.prismaService.$transaction([
      this.prismaService.groupMember.delete({
        where: {
          groupId_userId: {
            groupId,
            userId: targetUserId,
          },
        },
      }),
      this.prismaService.group.update({
        where: { id: groupId },
        data: { updatedAt: new Date() },
      }),
    ]);
    this.logger.log(
      'group_member_removed',
      JSON.stringify({
        actorUserId: actor.sub,
        groupId,
        targetUserId,
      }),
    );
    this.groupRealtimePublisher.invalidateGroupMemberCache(groupId);
    await this.groupRealtimePublisher.publishGroupUpdated(groupId, {
      includeUserIds: [targetUserId],
    });

    const [actorName, targetName] = await resolveGroupUserNames(this.prismaService, [actor.sub, targetUserId]);
    void this.systemMessageService.createSystemMessage(groupId, actor.sub, `${actorName} 将 ${targetName} 移出了频道`);

    return getGroup(membership.userId, groupId);
  }

  async updateMemberRole(
    actor: AuthenticatedActor,
    groupId: string,
    targetUserId: string,
    nextRole: GroupMemberRole,
    getGroup: (userId: string, groupId: string) => Promise<unknown>,
  ) {
    await this.permissionService.assertPermission(actor.role, 'manage_user_roles');
    await this.getMembershipOrThrow(groupId, actor.sub);
    await this.ensureGroupNotDM(groupId);

    if (targetUserId === actor.sub) {
      throw new BadRequestException('Use leave group instead of changing your own role here.');
    }

    const targetMembership = await this.prismaService.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUserId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!targetMembership) {
      throw new NotFoundException('Group member not found.');
    }

    if (targetMembership.role === nextRole) {
      return getGroup(actor.sub, groupId);
    }

    await this.prismaService.$transaction([
      this.prismaService.groupMember.update({
        where: {
          groupId_userId: {
            groupId,
            userId: targetUserId,
          },
        },
        data: {
          role: nextRole,
        },
      }),
      this.prismaService.group.update({
        where: { id: groupId },
        data: { updatedAt: new Date() },
      }),
    ]);
    this.logger.log(
      'group_member_role_updated',
      JSON.stringify({
        actorUserId: actor.sub,
        groupId,
        targetUserId,
        nextRole,
      }),
    );
    await this.groupRealtimePublisher.publishGroupUpdated(groupId);

    const [actorName, targetName] = await resolveGroupUserNames(this.prismaService, [actor.sub, targetUserId]);
    const roleLabel = nextRole === GroupMemberRole.ADMIN ? '管理员' : '成员';
    void this.systemMessageService.createSystemMessage(groupId, actor.sub, `${actorName} 将 ${targetName} 的角色设为 ${roleLabel}`);

    return getGroup(actor.sub, groupId);
  }

  async leaveGroup(userId: string, groupId: string) {
    const membership = await this.getMembershipOrThrow(groupId, userId);
    const [leaverName] = await resolveGroupUserNames(this.prismaService, [userId]);
    let archivedAfterLeave = false;

    const txResult = await this.prismaService.$transaction(async (tx) => {
      let shouldArchive = false;

      if (membership.role === GroupMemberRole.ADMIN) {
        const adminCount = await tx.groupMember.count({
          where: {
            groupId,
            role: GroupMemberRole.ADMIN,
          },
        });

        if (adminCount <= 1) {
          const successor = await tx.groupMember.findFirst({
            where: {
              groupId,
              userId: {
                not: userId,
              },
            },
            orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
            select: {
              userId: true,
            },
          });

          if (successor) {
            await tx.groupMember.update({
              where: {
                groupId_userId: {
                  groupId,
                  userId: successor.userId,
                },
              },
              data: {
                role: GroupMemberRole.ADMIN,
              },
            });
            this.logger.log(
              'group_admin_transferred_on_leave',
              JSON.stringify({
                actorUserId: userId,
                groupId,
                successorUserId: successor.userId,
              }),
            );
          } else {
            shouldArchive = true;
          }
        }
      }

      await tx.groupMember.delete({
        where: {
          groupId_userId: {
            groupId,
            userId,
          },
        },
      });

      if (shouldArchive) {
        await this.archiveGroupApplicationService.execute(
          {
            groupId,
            archive: true,
            reason: 'last-member',
            notification: {
              actorUserId: userId,
              text: `${leaverName} 退出了频道，频道因没有成员而归档`,
            },
          },
          tx,
        );
      } else {
        await tx.group.update({
          where: { id: groupId },
          data: { updatedAt: new Date() },
        });
      }

      return { shouldArchive };
    });

    archivedAfterLeave = txResult.shouldArchive;

    if (archivedAfterLeave) {
      this.logger.log(
        'group_archived_after_last_member_left',
        JSON.stringify({
          actorUserId: userId,
          groupId,
        }),
      );
    }

    this.logger.log(
      'group_member_left',
      JSON.stringify({
        actorUserId: userId,
        groupId,
      }),
    );
    if (!archivedAfterLeave) {
      this.groupRealtimePublisher.invalidateGroupMemberCache(groupId);
      await this.groupRealtimePublisher.publishGroupUpdated(groupId, {
        includeUserIds: [userId],
      });
      void this.systemMessageService.createSystemMessage(
        groupId,
        userId,
        `${leaverName} 退出了频道`,
      );
    }

    return {
      groupId,
      left: true,
      archivedAfterLeave,
    };
  }
}
