import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AvatarsService } from '../avatars/avatars.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../system-config/permission.service';
import { AdminGroupDiscoveryScope, AuthenticatedActor } from './group-types';

@Injectable()
export class GroupAdminDiscoveryService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly avatarsService: AvatarsService,
    private readonly permissionService: PermissionService,
  ) {}

  async listAdminDiscoverableGroups(
    actor: AuthenticatedActor,
    scope: AdminGroupDiscoveryScope = 'all',
    search?: string,
    category?: string,
    serverId?: string,
  ) {
    await this.permissionService.assertPermission(actor.role, 'view_all_groups');

    const normalizedSearch = search?.trim();
    const where: Prisma.GroupWhereInput = { isDM: false };

    if (serverId?.trim()) {
      where.serverId = serverId.trim();
    } else if (category?.trim()) {
      where.server = { name: category.trim() };
    }

    if (scope === 'archived') {
      where.archivedAt = { not: null };
    } else if (scope === 'former') {
      where.members = {
        none: {
          userId: actor.sub,
        },
      };
    }

    if (normalizedSearch) {
      where.AND = [
        {
          OR: [
            {
              name: {
                contains: normalizedSearch,
                mode: 'insensitive',
              },
            },
            {
              createdBy: {
                email: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
            },
            {
              createdBy: {
                displayName: {
                  contains: normalizedSearch,
                  mode: 'insensitive',
                },
              },
            },
            {
              members: {
                some: {
                  user: {
                    email: {
                      contains: normalizedSearch,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
            {
              members: {
                some: {
                  user: {
                    displayName: {
                      contains: normalizedSearch,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            },
          ],
        },
      ];
    }

    const groups = await this.prismaService.group.findMany({
      where,
      orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        name: true,
        category: true,
        serverId: true,
        server: {
          select: {
            id: true,
            name: true,
            avatarStorageKey: true,
            archivedAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        createdBy: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
        members: {
          where: {
            userId: actor.sub,
          },
          select: {
            role: true,
          },
        },
        workState: {
          select: { status: true, updatedAt: true },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
    });

    return groups.map((group) => {
      const currentMembership = group.members[0] ?? null;
      const isCurrentUserMember = Boolean(currentMembership);

      return {
        id: group.id,
        name: group.name,
        category: group.server?.name ?? group.category,
        serverId: group.serverId,
        server: group.server
          ? {
              id: group.server.id,
              name: group.server.name,
              avatarUrl: this.avatarsService.buildServerAvatarUrl(
                group.server.id,
                group.server.avatarStorageKey,
              ),
              archivedAt: group.server.archivedAt,
              createdAt: group.server.createdAt,
              updatedAt: group.server.updatedAt,
            }
          : null,
        archivedAt: group.archivedAt,
        createdAt: group.createdAt,
        updatedAt: group.updatedAt,
        createdBy: group.createdBy,
        workState: group.workState
          ? { status: group.workState.status, updatedAt: group.workState.updatedAt }
          : null,
        memberCount: group._count.members,
        isCurrentUserMember,
        currentUserMembershipRole: currentMembership?.role ?? null,
        canSelfJoin: !isCurrentUserMember,
        visibilityReason: isCurrentUserMember
          ? 'current_member'
          : group.archivedAt
            ? 'archived_admin_override'
            : 'admin_override',
        serverAvatarUrl: group.server
          ? this.avatarsService.buildServerAvatarUrl(group.server.id, group.server.avatarStorageKey)
          : null,
      };
    });
  }
}
