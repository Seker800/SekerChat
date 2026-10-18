import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';

@Injectable()
export class GroupNotificationsService {
  private readonly logger = new Logger(GroupNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: GroupRealtimePublisher,
  ) {}

  async update(userId: string, groupId: string, notificationsMuted: boolean) {
    await this.prisma.$transaction(async (tx) => {
      const members = await tx.$queryRaw<Array<{ notificationsMuted: boolean }>>`
        SELECT "notificationsMuted" FROM "GroupMember"
        WHERE "groupId" = ${groupId} AND "userId" = ${userId} FOR UPDATE
      `;
      if (!members.length) throw new ForbiddenException('只能设置自己已加入会话的通知。');
      const unmuting = members[0].notificationsMuted && !notificationsMuted;
      const latest = unmuting
        ? await tx.message.findFirst({
            where: { groupId },
            orderBy: { eventSequence: 'desc' },
            select: { eventSequence: true },
          })
        : null;
      await tx.groupMember.update({
        where: { groupId_userId: { groupId, userId } },
        data: {
          notificationsMuted,
          ...(unmuting
            ? { notificationsMutedThroughEventSequence: latest?.eventSequence ?? 0n }
            : {}),
        },
      });
    });
    // Reuse group invalidation to refresh this member's other browser sessions.
    // No preference value is broadcast to other members, and publication cannot undo the write.
    await this.realtime
      .publishGroupUpdated(groupId, {
        actorUserId: userId,
        reason: 'notification_preferences_updated',
      })
      .catch(() => this.logger.warn('通知偏好已保存，实时刷新暂不可用。'));
    return { groupId, notificationsMuted };
  }
}
