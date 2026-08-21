import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { GroupMemberRole, Prisma, UserRole } from '@prisma/client';
import { isAgentBot } from '../common/bot-identity';
import { PrismaService } from '../prisma/prisma.service';
import { GroupPresenter } from '../groups/group-presenter.service';
import { GroupQueryService } from '../groups/group-query.service';
import { groupWithMembersSelect } from '../groups/group-types';

function dmPairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

@Injectable()
export class DmService {
  private readonly logger = new Logger(DmService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly presenter: GroupPresenter,
    private readonly queryService: GroupQueryService,
  ) {}

  async createOrGetDM(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('Cannot create a DM with yourself.');
    }

    const targetUser = await this.prismaService.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, isBot: true },
    });

    if (!targetUser) {
      throw new NotFoundException('DM target user not found.');
    }

    if (
      (targetUser.role === UserRole.CLI_BOT && !isAgentBot(targetUser)) ||
      (targetUser.isBot && !isAgentBot(targetUser))
    ) {
      throw new BadRequestException('Legacy standalone bot does not support DM conversations.');
    }

    const dmKey = dmPairKey(userId, targetUserId);

    // Fast path: lookup by unique dmKey.
    const existingByKey = await this.prismaService.group.findUnique({
      where: { dmKey },
      select: groupWithMembersSelect,
    });

    if (existingByKey) {
      return this.presenter.serializeGroup(existingByKey, userId);
    }

    // Fallback: historical DM may have dmKey = NULL (duplicate pairs from before
    // the unique index existed). Member-based lookup catches these records so
    // they aren't orphaned.
    const historicalCandidates = await this.prismaService.group.findMany({
      where: {
        isDM: true,
        members: {
          every: { userId: { in: [userId, targetUserId] } },
          some: { userId },
        },
        AND: [{ members: { some: { userId: targetUserId } } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: groupWithMembersSelect,
    });
    const historical = historicalCandidates.find((g) => g.members.length === 2);
    if (historical) {
      return this.presenter.serializeGroup(historical, userId);
    }

    const group = await this.prismaService.$transaction(async (tx) => {
      // Double-check inside transaction (another txn may have inserted between our check and now)
      const existingByKey2 = await tx.group.findUnique({
        where: { dmKey },
        select: groupWithMembersSelect,
      });

      if (existingByKey2) {
        return existingByKey2;
      }

      try {
        return await tx.group.create({
          data: {
            name: 'dm',
            category: '私聊',
            isDM: true,
            dmKey,
            createdById: userId,
            members: {
              create: [
                { userId, role: GroupMemberRole.MEMBER },
                { userId: targetUserId, role: GroupMemberRole.MEMBER },
              ],
            },
          },
          select: groupWithMembersSelect,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // Lost the race: another concurrent transaction created the DM first.
          const winner = await tx.group.findUnique({
            where: { dmKey },
            select: groupWithMembersSelect,
          });
          if (winner) return winner;
        }
        throw error;
      }
    });

    this.logger.log(
      'dm_group_created',
      JSON.stringify({
        actorUserId: userId,
        targetUserId,
        groupId: group.id,
      }),
    );

    return this.presenter.serializeGroup(group, userId);
  }

  async listDMs(userId: string) {
    const groups = await this.prismaService.group.findMany({
      where: {
        isDM: true,
        members: {
          some: {
            userId,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: groupWithMembersSelect,
    });

    const unreadCounts = await this.queryService.batchUnreadCounts(
      userId,
      groups.map((g) => g.id),
    );

    return Promise.all(
      groups.map((group) =>
        this.presenter.serializeGroup(group, userId, undefined, unreadCounts.get(group.id) ?? 0),
      ),
    );
  }
}
