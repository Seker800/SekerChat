import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

    return this.ensureServerByName(input.category, client);
  }

  async listForUser(actor: AuthenticatedActor) {
    const canViewArchived = actor.role === 'SUPER_ADMIN';
    const servers = await this.prismaService.server.findMany({
      where: {
        ...(canViewArchived ? {} : { archivedAt: null }),
        groups: {
          some: {
            isDM: false,
            members: { some: { userId: actor.sub } },
          },
        },
      },
      orderBy: [{ archivedAt: 'asc' }, { updatedAt: 'desc' }],
    });
    return servers.map((server) => this.present(server));
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
    if (current.name === DEFAULT_SERVER_NAME) {
      throw new BadRequestException('默认 Server 不可归档。');
    }

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
