import { PrismaService } from '../prisma/prisma.service';

const UNKNOWN_GROUP_USER_NAME = '未知用户';

export async function resolveGroupUserName(prismaService: PrismaService, userId: string): Promise<string> {
  const user = await prismaService.user.findUnique({
    where: { id: userId },
    select: { displayName: true },
  });
  return user?.displayName || UNKNOWN_GROUP_USER_NAME;
}

export async function resolveGroupUserNames(prismaService: PrismaService, userIds: string[]): Promise<string[]> {
  const users = await prismaService.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, displayName: true },
  });
  const map = new Map(users.map((u) => [u.id, u.displayName || UNKNOWN_GROUP_USER_NAME]));
  return userIds.map((id) => map.get(id) || UNKNOWN_GROUP_USER_NAME);
}
