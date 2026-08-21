import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GroupRealtimePublisher } from '../realtime/group-realtime-publisher.service';
import { PermissionService } from '../system-config/permission.service';
import { ServersService } from '../servers/servers.service';

const DEFAULT_GROUP_CATEGORY = '未分类';

function normalizeGroupCategory(category?: string): string {
  const trimmed = category?.trim();
  return trimmed || DEFAULT_GROUP_CATEGORY;
}

@Injectable()
export class GroupCategoryService {
  private readonly logger = new Logger(GroupCategoryService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly realtimePublisher: GroupRealtimePublisher,
    private readonly permissionService: PermissionService,
    private readonly serversService: ServersService,
  ) {}

  normalizeCategory(category?: string): string {
    return this.serversService.normalizeName(category);
  }

  /** Ensure a Category row exists. */
  async ensureCategoryExists(name: string) {
    const normalized = normalizeGroupCategory(name);
    await this.serversService.ensureServerByName(normalized);
    return this.prismaService.category.findUniqueOrThrow({ where: { name: normalized } });
  }

  /** Archive or unarchive a whole server (SUPER_ADMIN only). */
  async archiveCategory(
    actor: { sub: string; role: string },
    categoryName: string,
    archive: boolean,
  ) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('仅超级管理员可以归档 Server。');
    }

    const server = await this.serversService.ensureServerByName(categoryName);
    const result = await this.serversService.archive(actor, server.id, archive);

    this.logger.log(
      archive ? 'category_archived' : 'category_unarchived',
      JSON.stringify({
        actorUserId: actor.sub,
        serverId: server.id,
        categoryName: server.name,
        groupCount: result.groupCount,
      }),
    );

    return {
      serverId: server.id,
      category: server.name,
      archivedAt: result.archivedAt,
      groupCount: result.groupCount,
    };
  }

  /** Cleanup Category row when no Groups reference it anymore. */
  private async removeOrphanedCategory(categoryName: string) {
    const remaining = await this.prismaService.group.count({
      where: { category: categoryName, isDM: false },
    });
    if (remaining === 0) {
      await this.prismaService.category.deleteMany({ where: { name: categoryName } });
    }
  }

  async listManageableCategories(actor: { sub: string; role: string }) {
    await this.permissionService.assertPermission(actor.role, 'manage_group_settings');

    const groups = await this.prismaService.group.findMany({
      where: {
        isDM: false,
        members: { some: { userId: actor.sub } },
      },
      select: {
        id: true,
        category: true,
        serverId: true,
        server: { select: { id: true, name: true } },
        archivedAt: true,
        updatedAt: true,
      },
    });

    const summaryMap = new Map<
      string,
      {
        serverId: string;
        name: string;
        groupCount: number;
        archivedGroupCount: number;
        activeGroupCount: number;
        latestUpdatedAt: Date | null;
      }
    >();

    for (const group of groups) {
      const serverId = group.server?.id ?? group.serverId ?? group.category;
      const name = group.server?.name ?? normalizeGroupCategory(group.category);
      const existing = summaryMap.get(serverId) ?? {
        serverId,
        name,
        groupCount: 0,
        archivedGroupCount: 0,
        activeGroupCount: 0,
        latestUpdatedAt: null,
      };

      existing.groupCount += 1;
      if (group.archivedAt) {
        existing.archivedGroupCount += 1;
      } else {
        existing.activeGroupCount += 1;
      }
      if (!existing.latestUpdatedAt || group.updatedAt > existing.latestUpdatedAt) {
        existing.latestUpdatedAt = group.updatedAt;
      }

      summaryMap.set(serverId, existing);
    }

    return [...summaryMap.values()].sort((left, right) => {
      if (left.name === DEFAULT_GROUP_CATEGORY) return 1;
      if (right.name === DEFAULT_GROUP_CATEGORY) return -1;
      if (right.groupCount !== left.groupCount) return right.groupCount - left.groupCount;
      return left.name.localeCompare(right.name, 'zh-Hans-CN');
    });
  }

  async renameCategory(actor: { sub: string; role: string }, from?: string, to?: string) {
    await this.permissionService.assertPermission(actor.role, 'manage_group_settings');

    const fromCategory = normalizeGroupCategory(from);
    const toCategory = normalizeGroupCategory(to);

    if (fromCategory === DEFAULT_GROUP_CATEGORY) {
      throw new BadRequestException('Default category cannot be renamed.');
    }

    if (fromCategory === toCategory) {
      return { from: fromCategory, to: toCategory, updatedGroupCount: 0 };
    }

    const server = await this.serversService.findByName(fromCategory);
    if (!server) {
      return { from: fromCategory, to: toCategory, updatedGroupCount: 0 };
    }

    const groupsToUpdate = await this.prismaService.group.findMany({
      where: {
        isDM: false,
        serverId: server.id,
        members: { some: { userId: actor.sub } },
      },
      select: { id: true },
    });

    await this.serversService.rename(actor, server.id, toCategory);

    this.logger.log(
      'group_category_renamed',
      JSON.stringify({
        actorUserId: actor.sub,
        from: fromCategory,
        to: toCategory,
        serverId: server.id,
        updatedGroupCount: groupsToUpdate.length,
      }),
    );

    await Promise.all(
      groupsToUpdate.map((group) => this.realtimePublisher.publishGroupUpdated(group.id)),
    );

    return {
      serverId: server.id,
      from: fromCategory,
      to: toCategory,
      updatedGroupCount: groupsToUpdate.length,
    };
  }

  async resetCategory(actor: { sub: string; role: string }, categoryName?: string) {
    await this.permissionService.assertPermission(actor.role, 'manage_group_settings');

    const normalizedCategory = normalizeGroupCategory(categoryName);

    if (normalizedCategory === DEFAULT_GROUP_CATEGORY) {
      throw new BadRequestException('Default category cannot be deleted.');
    }

    const server = await this.serversService.findByName(normalizedCategory);
    if (!server) {
      return {
        category: normalizedCategory,
        reassignedTo: DEFAULT_GROUP_CATEGORY,
        updatedGroupCount: 0,
      };
    }
    const defaultServer = await this.serversService.ensureServerByName(DEFAULT_GROUP_CATEGORY);

    const groupsToUpdate = await this.prismaService.group.findMany({
      where: {
        isDM: false,
        serverId: server.id,
        members: { some: { userId: actor.sub } },
      },
      select: { id: true },
    });

    if (!groupsToUpdate.length) {
      return {
        category: normalizedCategory,
        reassignedTo: DEFAULT_GROUP_CATEGORY,
        updatedGroupCount: 0,
      };
    }

    await this.prismaService.group.updateMany({
      where: { id: { in: groupsToUpdate.map((g) => g.id) } },
      data: {
        serverId: defaultServer.id,
        category: DEFAULT_GROUP_CATEGORY,
        updatedAt: new Date(),
      },
    });

    // Cleanup old category row if orphaned
    await this.removeOrphanedCategory(normalizedCategory);

    this.logger.log(
      'group_category_reset',
      JSON.stringify({
        actorUserId: actor.sub,
        category: normalizedCategory,
        updatedGroupCount: groupsToUpdate.length,
      }),
    );

    await Promise.all(
      groupsToUpdate.map((group) => this.realtimePublisher.publishGroupUpdated(group.id)),
    );

    return {
      category: normalizedCategory,
      serverId: server.id,
      reassignedToServerId: defaultServer.id,
      reassignedTo: DEFAULT_GROUP_CATEGORY,
      updatedGroupCount: groupsToUpdate.length,
    };
  }
}
