import { ForbiddenException, Logger } from '@nestjs/common';
import { hasFullWorkspaceAccess } from '@sekerchat/shared';
import { PrismaService } from '../prisma/prisma.service';

export async function assertReadableGroupMembership(
  prismaService: PrismaService,
  logger: Logger,
  userId: string,
  groupId: string,
  denyEvent: string,
  role?: string,
) {
  const effectiveRole = role ?? (await lookupUserRole(prismaService, userId));

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

  // Not a member — ADMIN and SUPER_ADMIN can read non-DM groups without joining.
  if (hasFullWorkspaceAccess(effectiveRole)) {
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

/** Lazy lookup: only queries DB when caller didn't pass a role. */
async function lookupUserRole(
  prismaService: PrismaService,
  userId: string,
): Promise<string | undefined> {
  const user = await prismaService.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return user?.role;
}
