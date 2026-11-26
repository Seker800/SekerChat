import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../system-config/permission.service';
import {
  groupSummarySelect,
  groupWithMembersSelect,
  type GroupListItem,
  type GroupSummaryRecord,
  type GroupWithMembers,
} from './group-types';
import { GroupMembershipService } from './group-membership.service';
import { GroupPresenter } from './group-presenter.service';
import { loadLatestMessage, loadLatestMessages } from './group-latest-message';

@Injectable()
export class GroupQueryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly membershipService: GroupMembershipService,
    private readonly presenter: GroupPresenter,
    private readonly permissionService: PermissionService,
  ) {}

  async listGroups(
    userId: string,
    canViewArchived: boolean,
    view: 'full' | 'summary' = 'full',
  ) {
    const rawGroups = await this.prismaService.group.findMany({
      where: {
        isDM: false,
        members: {
          some: {
            userId,
          },
        },
        ...(canViewArchived ? {} : { archivedAt: null }),
        AND: [{ OR: [{ serverId: null }, { server: { hiddenAt: null } }] }],
      },
      orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
      select: view === 'summary' ? groupSummarySelect(userId) : groupWithMembersSelect,
    });

    const groups: GroupListItem[] = view === 'summary'
      ? (rawGroups as GroupSummaryRecord[]).map((group) => ({
          ...group,
          members: [],
          memberCount: group._count.members,
          currentUserMembership: group.members[0] ?? null,
          isMember: Boolean(group.members[0]),
        }))
      : (rawGroups as GroupWithMembers[]);

    const groupIds = groups.map((group) => group.id);
    const [unreadCounts, latestMessages, prefetch] = await Promise.all([
      this.batchUnreadCounts(userId, groupIds),
      loadLatestMessages(this.prismaService, groupIds),
      this.buildGroupSerializePrefetch(groups),
    ]);

    const groupsWithLatest = groups.map((group) => ({
      ...group,
      latestMessage: latestMessages.get(group.id) ?? null,
    }));

    return Promise.all(
      groupsWithLatest.map((group) =>
        this.presenter.serializeGroup(
          group,
          userId,
          undefined,
          unreadCounts.get(group.id) ?? 0,
          prefetch,
        ),
      ),
    );
  }

  async buildGroupSerializePrefetch(
    groups: Array<{ category: string; artifactsConfirmedByUserId: string | null }>,
  ) {
    const categoryNames = [...new Set(groups.map((g) => g.category))];
    const confirmedByUserIds = [
      ...new Set(groups.map((g) => g.artifactsConfirmedByUserId).filter(Boolean) as string[]),
    ];

    const [categoryRows, userRows] = await Promise.all([
      categoryNames.length > 0
        ? this.prismaService.category.findMany({
            where: { name: { in: categoryNames } },
            select: { name: true, avatarStorageKey: true, archivedAt: true },
          })
        : ([] as Array<{ name: string; avatarStorageKey: string | null; archivedAt: Date | null }>),
      confirmedByUserIds.length > 0
        ? this.prismaService.user.findMany({
            where: { id: { in: confirmedByUserIds } },
            select: { id: true, displayName: true },
          })
        : ([] as Array<{ id: string; displayName: string | null }>),
    ]);

    const categoryAvatars = new Map(categoryRows.map((c) => [c.name, c.avatarStorageKey]));
    const categoryArchivedAts = new Map(
      categoryRows.map((c) => [c.name, c.archivedAt?.toISOString() ?? null]),
    );
    const userDisplayNames = new Map(userRows.map((u) => [u.id, u.displayName ?? '未知用户']));

    return { categoryAvatars, categoryArchivedAts, userDisplayNames };
  }

  async getGroup(userId: string, groupId: string, role?: string) {
    const canViewAllGroups = await this.permissionService.hasPermission(
      role ?? 'MEMBER',
      'view_all_groups',
    );
    let membership: { role: string } | null = null;
    if (canViewAllGroups) {
      membership = (await this.prismaService.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { role: true },
      })) ?? { role: 'MEMBER' as const };
    } else {
      membership = await this.membershipService.getMembershipOrThrow(groupId, userId);
    }

    const group = (await this.prismaService.group.findUnique({
      where: { id: groupId },
      select: groupWithMembersSelect,
    })) as GroupWithMembers | null;

    if (!group) {
      throw new NotFoundException('Group not found.');
    }

    // Full-access admins still cannot view non-member DM metadata (matches assertReadableGroupMembership)
    if (canViewAllGroups && group.isDM && !group.members.some((m) => m.user.id === userId)) {
      throw new ForbiddenException('Group access denied.');
    }

    const [unreadCounts, latestMessage] = await Promise.all([
      this.batchUnreadCounts(userId, [groupId]),
      loadLatestMessage(this.prismaService, groupId),
    ]);
    return await this.presenter.serializeGroup(
      { ...group, latestMessage },
      membership.role,
      userId,
      unreadCounts.get(groupId) ?? 0,
    );
  }

  async markGroupRead(userId: string, groupId: string, role?: string): Promise<void> {
    await this.getGroup(userId, groupId, role);

    const maxSeq = await this.prismaService.message.findFirst({
      where: { groupId },
      orderBy: { eventSequence: 'desc' },
      select: { eventSequence: true },
    });

    await this.prismaService.groupMember.updateMany({
      where: { groupId, userId },
      data: { lastReadEventSequence: maxSeq?.eventSequence ?? 0n },
    });
  }

  async advanceReadCursor(userId: string, groupId: string, eventSequence: bigint) {
    if (eventSequence < 1n || eventSequence > 9_223_372_036_854_775_807n) {
      throw new BadRequestException('Read cursor is outside the supported message sequence range.');
    }
    const membership = await this.prismaService.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { lastReadEventSequence: true },
    });
    if (!membership) {
      throw new ForbiddenException('Group access denied.');
    }

    const targetMessage = await this.prismaService.message.findFirst({
      where: { groupId, eventSequence },
      select: { eventSequence: true },
    });
    if (!targetMessage) {
      throw new BadRequestException('Read cursor must reference a message in this group.');
    }

    const current = membership.lastReadEventSequence ?? 0n;
    if (current >= targetMessage.eventSequence) {
      return {
        groupId,
        lastReadEventSequence: current.toString(),
        changed: false,
      };
    }

    const update = await this.prismaService.groupMember.updateMany({
      where: {
        groupId,
        userId,
        OR: [
          { lastReadEventSequence: null },
          { lastReadEventSequence: { lt: targetMessage.eventSequence } },
        ],
      },
      data: { lastReadEventSequence: targetMessage.eventSequence },
    });

    if (update.count === 0) {
      const winner = await this.prismaService.groupMember.findUniqueOrThrow({
        where: { groupId_userId: { groupId, userId } },
        select: { lastReadEventSequence: true },
      });
      return {
        groupId,
        lastReadEventSequence: (
          winner.lastReadEventSequence ?? targetMessage.eventSequence
        ).toString(),
        changed: false,
      };
    }

    return {
      groupId,
      lastReadEventSequence: targetMessage.eventSequence.toString(),
      changed: true,
    };
  }

  async batchUnreadCounts(userId: string, groupIds: string[]): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (!groupIds.length) return result;

    // One indexed lookup per membership instead of aggregating the whole Message table.
    const rows = await this.prismaService.$queryRaw<Array<{ groupId: string; count: bigint }>>`
      SELECT
        gm."groupId" AS "groupId",
        CASE
          WHEN gm."lastReadEventSequence" IS NULL THEN 0::bigint
          ELSE (
            SELECT COUNT(*)::bigint
            FROM "Message" m
            WHERE m."groupId" = gm."groupId"
              AND m."eventSequence" > gm."lastReadEventSequence"
          )
        END AS "count"
      FROM "GroupMember" gm
      WHERE gm."userId" = ${userId}
        AND gm."groupId" IN (${Prisma.join(groupIds)})
    `;

    for (const groupId of groupIds) {
      result.set(groupId, 0);
    }
    for (const row of rows) {
      result.set(row.groupId, Number(row.count));
    }
    return result;
  }
}
