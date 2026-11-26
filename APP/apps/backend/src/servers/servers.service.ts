import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ServerNameKind, type Server } from '@prisma/client';
import { OutboxService } from '../outbox/outbox.service';
import { OUTBOX_EVENT_TYPES } from '../outbox/outbox.types';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../system-config/permission.service';
import { AuthenticatedActor } from '../groups/group-types';
import { DEFAULT_SERVER_NAME, normalizeServerName } from './server-name';
import { ConfigService } from '@nestjs/config';

type DatabaseClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ServersService {
  private readonly logger = new Logger(ServersService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly outboxService: OutboxService,
    private readonly configService: ConfigService,
  ) {}

  normalizeName(name?: string): string {
    return normalizeServerName(name);
  }

  async ensureServerByName(
    name?: string,
    client: DatabaseClient = this.prismaService,
  ): Promise<Server> {
    const normalizedName = normalizeServerName(name);
    if (client === this.prismaService) {
      return this.prismaService.$transaction((transaction) =>
        this.ensureServerByName(normalizedName, transaction),
      );
    }

    await client.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'sekerchat-server-name:' + normalizedName}, 0))`,
    );

    const existingClaim = await client.serverNameClaim.findUnique({
      where: { name: normalizedName },
      include: { server: true },
    });
    let server = existingClaim?.server;

    if (!server) {
      const existingServer = await client.server.findUnique({ where: { name: normalizedName } });
      if (existingServer) {
        await client.serverNameClaim.create({
          data: {
            name: normalizedName,
            kind: ServerNameKind.CANONICAL,
            serverId: existingServer.id,
          },
        });
        server = existingServer;
      } else {
        server = await client.server.create({
          data: {
            name: normalizedName,
            nameClaims: {
              create: { name: normalizedName, kind: ServerNameKind.CANONICAL },
            },
          },
        });
      }
    }

    await client.category.upsert({
      where: { name: normalizedName },
      create: { name: normalizedName },
      update: {},
    });

    return server;
  }

  async resolveServer(
    input: { serverId?: string; category?: string },
    client: DatabaseClient = this.prismaService,
  ) {
    if (input.serverId) {
      const server = await client.server.findUnique({ where: { id: input.serverId } });
      if (!server) throw new NotFoundException('Server not found.');
      this.assertActiveChannelTarget(server);
      if (input.category) {
        const categoryName = normalizeServerName(input.category);
        if (categoryName !== server.name) {
          const claim = await client.serverNameClaim.findUnique({
            where: { name: categoryName },
            select: { serverId: true },
          });
          if (claim?.serverId !== server.id) {
            throw new BadRequestException('serverId and category refer to different servers.');
          }
        }
      }
      await client.category.upsert({
        where: { name: server.name },
        create: { name: server.name },
        update: {},
      });
      return server;
    }

    const server = await this.ensureServerByName(input.category, client);
    this.assertActiveChannelTarget(server);
    return server;
  }

  private assertActiveChannelTarget(server: Server) {
    if (server.hiddenAt) {
      throw new BadRequestException(
        'Server 已隐藏，无法在其中创建或移动频道。请先用 scripts/servers-visibility.mjs list 找到并 unhide <id> 恢复（生产库需加 --allow-remote；如已归档还需取消归档）。',
      );
    }
    if (server.archivedAt) {
      throw new BadRequestException('Server 已归档，请先恢复后再创建或移动频道。');
    }
  }

  async listForUser(actor: AuthenticatedActor) {
    const canViewAll = await this.permissionService.hasPermission(actor.role, 'view_all_groups');
    const servers = await this.prismaService.server.findMany({
      where: canViewAll
        ? { hiddenAt: null }
        : {
            archivedAt: null,
            hiddenAt: null,
            groups: {
              some: {
                isDM: false,
                members: { some: { userId: actor.sub } },
              },
            },
          },
      orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
    });

    if (!canViewAll || servers.length === 0) {
      return servers.map((server) => ({ ...this.present(server), isMember: true }));
    }

    const memberships = await this.prismaService.group.findMany({
      where: {
        isDM: false,
        serverId: { in: servers.map((server) => server.id) },
        members: { some: { userId: actor.sub } },
      },
      select: { serverId: true },
      distinct: ['serverId'],
    });
    const memberServerIds = new Set(
      memberships
        .map((group) => group.serverId)
        .filter((serverId): serverId is string => Boolean(serverId)),
    );

    return servers.map((server) => ({
      ...this.present(server),
      isMember: memberServerIds.has(server.id),
    }));
  }

  async setHidden(actor: AuthenticatedActor, serverId: string, hidden: boolean) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('仅超级管理员可以隐藏 Server。');
    }

    const current = await this.requireServer(serverId);
    if (hidden && current.name === DEFAULT_SERVER_NAME) {
      throw new BadRequestException('默认 Server 不能隐藏。');
    }

    const groupCount = await this.prismaService.group.count({
      where: { serverId, isDM: false },
    });
    if (Boolean(current.hiddenAt) === hidden) {
      return this.presentHidden(current, groupCount);
    }

    const { updated, changed } = await this.prismaService.$transaction(async (transaction) => {
      const result = await transaction.server.updateMany({
        where: { id: serverId, hiddenAt: hidden ? null : { not: null } },
        data: { hiddenAt: hidden ? new Date() : null },
      });
      if (result.count > 0) {
        await this.outboxService.enqueue(transaction, {
          eventType: OUTBOX_EVENT_TYPES.serverVisibilityChanged,
          aggregateType: 'Server',
          aggregateId: serverId,
          payload: { serverId, hidden },
        });
      }
      return {
        changed: result.count > 0,
        updated: await transaction.server.findUniqueOrThrow({ where: { id: serverId } }),
      };
    });

    if (changed) {
      this.logger.log(
        hidden ? 'server_hidden' : 'server_unhidden',
        JSON.stringify({
          actorUserId: actor.sub,
          serverId,
          serverName: updated.name,
          archived: Boolean(updated.archivedAt),
          groupCount,
        }),
      );
    }

    return this.presentHidden(updated, groupCount);
  }

  /** Hide an emptied Server as part of an authorized cleanup. */
  async hideIfEmpty(actor: AuthenticatedActor, serverId: string, reason: string) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('仅超级管理员可以隐藏 Server。');
    }

    const { updated, changed } = await this.prismaService.$transaction(async (transaction) => {
      const result = await transaction.server.updateMany({
        where: {
          id: serverId,
          hiddenAt: null,
          archivedAt: null,
          name: { not: DEFAULT_SERVER_NAME },
          groups: { none: { isDM: false } },
        },
        data: { hiddenAt: new Date() },
      });
      if (result.count > 0) {
        await this.outboxService.enqueue(transaction, {
          eventType: OUTBOX_EVENT_TYPES.serverVisibilityChanged,
          aggregateType: 'Server',
          aggregateId: serverId,
          payload: { serverId, hidden: true },
        });
      }
      return {
        changed: result.count > 0,
        updated: await transaction.server.findUniqueOrThrow({ where: { id: serverId } }),
      };
    });

    if (!changed) return false;

    this.logger.log(
      'server_hidden',
      JSON.stringify({
        actorUserId: actor.sub,
        serverId,
        serverName: updated.name,
        archived: Boolean(updated.archivedAt),
        groupCount: 0,
        reason,
      }),
    );
    return true;
  }

  async listHidden(actor: AuthenticatedActor) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('仅超级管理员可以查看隐藏的 Server。');
    }

    const servers = await this.prismaService.server.findMany({
      where: { hiddenAt: { not: null } },
      orderBy: { hiddenAt: 'desc' },
      select: {
        id: true,
        name: true,
        hiddenAt: true,
        archivedAt: true,
        _count: { select: { groups: { where: { isDM: false } } } },
      },
    });

    return servers.map((server) => ({
      serverId: server.id,
      name: server.name,
      hiddenAt: server.hiddenAt,
      archivedAt: server.archivedAt,
      groupCount: server._count.groups,
    }));
  }

  private presentHidden(server: Server, groupCount: number) {
    return {
      serverId: server.id,
      name: server.name,
      hiddenAt: server.hiddenAt,
      archivedAt: server.archivedAt,
      groupCount,
    };
  }

  async rename(actor: AuthenticatedActor, serverId: string, nextName?: string) {
    await this.permissionService.assertPermission(actor.role, 'manage_group_settings');
    const normalizedName = normalizeServerName(nextName);
    const current = await this.requireServer(serverId);
    if (actor.role !== 'SUPER_ADMIN') {
      const membershipCount = await this.prismaService.group.count({
        where: {
          serverId,
          isDM: false,
          members: { some: { userId: actor.sub } },
        },
      });
      if (membershipCount === 0) throw new NotFoundException('Server not found.');
    }

    if (current.name === DEFAULT_SERVER_NAME) {
      throw new BadRequestException('Default server cannot be renamed.');
    }
    if (current.name === normalizedName) return this.present(current);

    try {
      const updated = await this.prismaService.$transaction(async (transaction) => {
        const [lockedCurrent] = await transaction.$queryRaw<Array<typeof current>>(
          Prisma.sql`SELECT * FROM "Server" WHERE "id" = ${serverId} FOR UPDATE`,
        );
        if (!lockedCurrent) throw new NotFoundException('Server not found.');
        if (lockedCurrent.name === normalizedName) return lockedCurrent;

        await transaction.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${'sekerchat-server-name:' + normalizedName}, 0))`,
        );
        const targetClaim = await transaction.serverNameClaim.findUnique({
          where: { name: normalizedName },
          select: { serverId: true },
        });
        if (targetClaim && targetClaim.serverId !== serverId) {
          throw new BadRequestException('A server with this name already exists.');
        }

        await transaction.serverNameClaim.updateMany({
          where: { serverId, kind: ServerNameKind.CANONICAL },
          data: { kind: ServerNameKind.LEGACY },
        });
        await transaction.serverNameClaim.upsert({
          where: { name: lockedCurrent.name },
          create: {
            name: lockedCurrent.name,
            kind: ServerNameKind.LEGACY,
            serverId,
          },
          update: { kind: ServerNameKind.LEGACY },
        });
        await transaction.serverNameClaim.upsert({
          where: { name: normalizedName },
          create: { name: normalizedName, kind: ServerNameKind.CANONICAL, serverId },
          update: { kind: ServerNameKind.CANONICAL },
        });
        const updated = await transaction.server.update({
          where: { id: serverId },
          data: { name: normalizedName },
        });
        await transaction.category.upsert({
          where: { name: normalizedName },
          create: {
            name: normalizedName,
            avatarStorageKey: lockedCurrent.avatarStorageKey,
            archivedAt: lockedCurrent.archivedAt,
          },
          update: {},
        });
        return updated;
      });
      return this.present(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('A server with this name already exists.');
      }
      throw error;
    }
  }

  async archive(actor: AuthenticatedActor, serverId: string, archive = true) {
    if (actor.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('仅超级管理员可以归档 Server。');
    }

    const current = await this.requireServer(serverId);

    const changedAt = new Date();
    return this.prismaService.$transaction(async (transaction) => {
      const changed = await transaction.server.updateMany({
        where: {
          id: serverId,
          archivedAt: archive ? null : { not: null },
        },
        data: { archivedAt: archive ? changedAt : null, updatedAt: changedAt },
      });
      const groupCount = await transaction.group.count({
        where: { serverId, isDM: false },
      });

      if (changed.count > 0) {
        await this.outboxService.enqueue(transaction, {
          eventType: OUTBOX_EVENT_TYPES.serverLifecycleRequested,
          aggregateType: 'Server',
          aggregateId: serverId,
          payload: { serverId, archive },
        });
      }

      return {
        serverId,
        name: current.name,
        category: current.name,
        archivedAt: changed.count > 0 ? (archive ? changedAt : null) : current.archivedAt,
        groupCount,
      };
    });
  }

  requireServer(serverId: string) {
    return this.prismaService.server.findUnique({ where: { id: serverId } }).then((server) => {
      if (!server) throw new NotFoundException('Server not found.');
      return server;
    });
  }

  async findByName(name?: string) {
    const normalizedName = normalizeServerName(name);
    const claim = await this.prismaService.serverNameClaim.findUnique({
      where: { name: normalizedName },
      include: { server: true },
    });
    return claim?.server ?? null;
  }

  buildAvatarUrl(serverId: string, storageKey?: string | null): string | null {
    if (!storageKey) return null;
    const apiBaseUrl = this.configService.getOrThrow<string>('API_BASE_URL');
    const url = new URL(`/api/avatars/servers/by-id/${serverId}/content`, apiBaseUrl);
    url.searchParams.set('v', storageKey);
    return url.toString();
  }

  present(server: {
    id: string;
    name: string;
    avatarStorageKey: string | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: server.id,
      name: server.name,
      avatarUrl: this.buildAvatarUrl(server.id, server.avatarStorageKey),
      archivedAt: server.archivedAt,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    };
  }
}
