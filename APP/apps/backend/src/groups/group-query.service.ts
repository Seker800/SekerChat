import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { groupWithMembersSelect } from './group-types';
import { GroupMembershipService } from './group-membership.service';
import { GroupPresenter } from './group-presenter.service';

@Injectable()
export class GroupQueryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly membershipService: GroupMembershipService,
    private readonly presenter: GroupPresenter,
  ) {}

  async listGroups(userId: string, canViewArchived: boolean) {
    const groups = await this.prismaService.group.findMany({
      where: {
        isDM: false,
        members: {
          some: {
            userId,
          },
        },
        ...(canViewArchived ? {} : { archivedAt: null }),
      },
      orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
      select: groupWithMembersSelect,
    });

    const unreadCounts = await this.batchUnreadCounts(
      userId,
      groups.map((g) => g.id),
    );

    // Batch prefetch: avoid N+1 queries on category and confirmedByUserName
    const prefetch = await this.buildGroupSerializePrefetch(groups);

    return Promise.all(
      groups.map((group) =>
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

  private async buildGroupSerializePrefetch(
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
    let membership: { role: string } | null = null;
    if (role === 'SUPER_ADMIN') {
      membership = (await this.prismaService.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
        select: { role: true },
      })) ?? { role: 'MEMBER' as const };
    } else {
      membership = await this.membershipService.getMembershipOrThrow(groupId, userId);
    }

    const group = await this.prismaService.group.findUnique({
      where: { id: groupId },
      select: groupWithMembersSelect,
    });

    if (!group) {
      throw new NotFoundException('Group not found.');
    }

    // SUPER_ADMIN cannot view non-member DM metadata (matches assertReadableGroupMembership)
    if (role === 'SUPER_ADMIN' && group.isDM && !group.members.some((m) => m.user.id === userId)) {
      throw new ForbiddenException('Group access denied.');
    }

    const unreadCounts = await this.batchUnreadCounts(userId, [groupId]);
    return await this.presenter.serializeGroup(
      group,
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
        lastReadEventSequence: (winner.lastReadEventSequence ?? targetMessage.eventSequence).toString(),
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

    const memberships = await this.prismaService.groupMember.findMany({
      where: { groupId: { in: groupIds }, userId },
      select: { groupId: true, lastReadEventSequence: true },
    });
    const lastReadMap = new Map(memberships.map((m) => [m.groupId, m.lastReadEventSequence]));
    const unreadRows = await this.prismaService.$queryRaw<
      Array<{ groupId: string; count: bigint }>
    >`
      SELECT gm."groupId" AS "groupId", COUNT(m."id")::bigint AS "count"
      FROM "GroupMember" gm
      LEFT JOIN "Message" m
        ON gm."lastReadEventSequence" IS NOT NULL
       AND m."groupId" = gm."groupId"
       AND m."eventSequence" > gm."lastReadEventSequence"
      WHERE gm."userId" = ${userId}
        AND gm."groupId" IN (${Prisma.join(groupIds)})
      GROUP BY gm."groupId"
    `;
    const unreadMap = new Map(unreadRows.map((row) => [row.groupId, Number(row.count)]));

    for (const groupId of groupIds) {
      const lastReadSeq = lastReadMap.get(groupId);
      if (lastReadSeq === null || lastReadSeq === undefined) {
        result.set(groupId, 0);
        continue;
      }

      result.set(groupId, unreadMap.get(groupId) ?? 0);
    }

    return result;
  }
}
