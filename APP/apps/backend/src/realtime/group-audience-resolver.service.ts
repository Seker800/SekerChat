import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const GROUP_MEMBER_CACHE_TTL_MS = 30_000;

@Injectable()
export class GroupAudienceResolver {
  private readonly cache = new Map<string, { userIds: Set<string>; expiresAt: number }>();

  constructor(private readonly prismaService: PrismaService) {}

  async resolve(groupId: string): Promise<Set<string>> {
    const cached = this.cache.get(groupId);
    if (cached && cached.expiresAt > Date.now()) return new Set(cached.userIds);

    const members = await this.prismaService.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const userIds = new Set(members.map((member) => member.userId));
    this.cache.set(groupId, { userIds, expiresAt: Date.now() + GROUP_MEMBER_CACHE_TTL_MS });
    return new Set(userIds);
  }

  invalidate(groupId: string): void {
    this.cache.delete(groupId);
  }
}
