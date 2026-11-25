import { ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export async function assertReadableGroupMembership(
  prismaService: PrismaService,
  logger: Logger,
  userId: string,
  groupId: string,
  denyEvent: string,
  canReadAllNonDmGroups = false,
) {
  // First try normal membership check
  const group = await prismaService.group.findFirst({
    where: {
      id: groupId,
      members: {
        some: {
          userId,
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (group) return group;

  // Non-members can read non-DM groups only when the caller has view_all_groups.
  if (canReadAllNonDmGroups) {
    const nonDmGroup = await prismaService.group.findUnique({
      where: { id: groupId },
      select: { id: true, isDM: true },
    });
    if (nonDmGroup && !nonDmGroup.isDM) {
      return nonDmGroup;
    }
  }

  logger.warn(
    denyEvent,
    JSON.stringify({
      userId,
      groupId,
    }),
  );
  throw new ForbiddenException('Group access denied.');
}
