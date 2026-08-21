import { ForbiddenException, Injectable } from '@nestjs/common';
import { GroupMemberRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionConfigService } from '../system-config/permission-config.service';
import { PermissionService } from '../system-config/permission.service';
import { GroupAdminDiscoveryService } from './group-admin-discovery.service';
import { GroupCategoryService } from './group-category.service';
import { GroupChannelService } from './group-channel.service';
import { GroupMembershipService } from './group-membership.service';
import { GroupPresenter } from './group-presenter.service';
import { GroupQueryService } from './group-query.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { AdminGroupDiscoveryScope, AuthenticatedActor } from './group-types';

export type { AdminGroupDiscoveryScope } from './group-types';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly permissionConfigService: PermissionConfigService,
    private readonly permissionService: PermissionService,
    private readonly categoryService: GroupCategoryService,
    private readonly queryService: GroupQueryService,
    private readonly membershipService: GroupMembershipService,
    private readonly adminDiscoveryService: GroupAdminDiscoveryService,
    private readonly presenter: GroupPresenter,
    private readonly channelService: GroupChannelService,
    private readonly groupRealtimePublisher: GroupRealtimePublisher,
  ) {}

  async createGroup(
    actor: AuthenticatedActor,
    name: string,
    server: { serverId?: string; category?: string },
  ) {
    return this.channelService.createGroup(actor, name, server);
  }

  async listGroups(userId: string, role?: string) {
    const rp = await this.permissionConfigService.getRolePermissions();
    const canViewArchived = (rp[role ?? 'MEMBER'] ?? []).includes('view_archived_channels');
    return this.queryService.listGroups(userId, canViewArchived);
  }

  async listInviteCandidates(actor: AuthenticatedActor, groupId: string) {
    await this.permissionService.assertPermission(actor.role, 'invite_members');

    // SUPER_ADMIN can invite even without membership
    const isMember = await this.prismaService.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: actor.sub } },
      select: { userId: true },
    });
    if (!isMember && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Group access denied.');
    }
    await this.membershipService.ensureGroupNotDM(groupId);

    const users = await this.prismaService.user.findMany({
      where: {
        id: {
          not: actor.sub,
        },
        isBot: false,
        disabledAt: null,
        groupMembers: {
          none: {
            groupId,
          },
        },
      },
      orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
      },
    });

    return users.map((user) => this.presenter.serializeInviteCandidate(user));
  }

  async markGroupRead(userId: string, groupId: string, role?: string): Promise<void> {
    await this.queryService.markGroupRead(userId, groupId, role);
    await this.groupRealtimePublisher.publishGroupUpdated(groupId, {
      actorUserId: userId,
      reason: 'read_receipt_updated',
    });
  }

  async advanceReadCursor(userId: string, groupId: string, eventSequence: bigint) {
    const result = await this.queryService.advanceReadCursor(userId, groupId, eventSequence);
    if (result.changed) {
      await this.groupRealtimePublisher.publishReadCursorChanged(groupId, {
        userId,
        lastReadEventSequence: result.lastReadEventSequence,
      });
    }
    return result;
  }

  async listAdminDiscoverableGroups(
    actor: AuthenticatedActor,
    scope: AdminGroupDiscoveryScope = 'all',
    search?: string,
    category?: string,
    serverId?: string,
  ) {
    return this.adminDiscoveryService.listAdminDiscoverableGroups(
      actor,
      scope,
      search,
      category,
      serverId,
    );
  }

  async resetCategory(actor: AuthenticatedActor, categoryName?: string) {
    return this.categoryService.resetCategory(actor, categoryName);
  }

  async listManageableCategories(actor: AuthenticatedActor) {
    return this.categoryService.listManageableCategories(actor);
  }

  async renameCategory(actor: AuthenticatedActor, from?: string, to?: string) {
    return this.categoryService.renameCategory(actor, from, to);
  }

  async adminJoinGroup(actor: AuthenticatedActor, groupId: string) {
    return this.channelService.adminJoinGroup(actor, groupId, this.getGroup.bind(this));
  }

  async getGroup(userId: string, groupId: string, role?: string) {
    return this.queryService.getGroup(userId, groupId, role);
  }

  async updateGroup(
    actor: AuthenticatedActor,
    groupId: string,
    updates: {
      name?: string;
      category?: string;
      serverId?: string;
    },
  ) {
    return this.channelService.updateGroup(actor, groupId, updates, this.getGroup.bind(this));
  }

  async inviteMember(actor: AuthenticatedActor, groupId: string, email: string) {
    return this.membershipService.inviteMember(actor, groupId, email, this.getGroup.bind(this));
  }

  async removeMember(actor: AuthenticatedActor, groupId: string, targetUserId: string) {
    return this.membershipService.removeMember(
      actor,
      groupId,
      targetUserId,
      this.getGroup.bind(this),
    );
  }

  async updateMemberRole(
    actor: AuthenticatedActor,
    groupId: string,
    targetUserId: string,
    nextRole: GroupMemberRole,
  ) {
    return this.membershipService.updateMemberRole(
      actor,
      groupId,
      targetUserId,
      nextRole,
      this.getGroup.bind(this),
    );
  }

  async leaveGroup(userId: string, groupId: string) {
    return this.membershipService.leaveGroup(userId, groupId);
  }

  async archiveGroup(actor: AuthenticatedActor, groupId: string, archive = true) {
    return this.channelService.archiveGroup(actor, groupId, archive, this.getGroup.bind(this));
  }

  async archiveCategory(actor: AuthenticatedActor, categoryName: string, archive = true) {
    return this.categoryService.archiveCategory(actor, categoryName, archive);
  }

  /** Ensure a Category row exists. */
  async ensureCategoryExists(name: string) {
    return this.categoryService.ensureCategoryExists(name);
  }

  async assertGroupReadable(groupId: string, userId: string): Promise<void> {
    await this.membershipService.assertGroupReadable(groupId, userId);
  }

  async markGroupUpdatedFromIntegration(groupId: string): Promise<void> {
    await this.channelService.markGroupUpdatedFromIntegration(groupId);
  }
}
