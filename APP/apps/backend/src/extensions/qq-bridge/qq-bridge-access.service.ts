import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { QqBridgeConnector, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionService } from '../../system-config/permission.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { BindingDto, ToggleBindingDto } from './qq-bridge.dto';

export function hashBridgeSecret(secret: string) {
  return createHash('sha256').update(secret).digest('hex');
}

@Injectable()
export class QqBridgeAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

  async assertAdmin(actor: { role: string }) {
    await this.permissions.assertPermission(actor.role, 'manage_system_config');
  }

  async assertGroupManager(
    actor: { sub: string; role: string },
    groupId: string,
    requireActive = false,
  ) {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      include: { server: true, members: { where: { userId: actor.sub }, select: { role: true } } },
    });
    if (!group) throw new BadRequestException('目标群不存在。');
    if (
      actor.role !== 'SUPER_ADMIN' &&
      group.createdById !== actor.sub &&
      !group.members.some((member) => member.role === 'ADMIN')
    )
      throw new ForbiddenException('没有目标群的管理权限。');
    if (requireActive && (group.isDM || group.archivedAt || group.server?.archivedAt))
      throw new BadRequestException('只能绑定有效的普通群。');
    return group;
  }

  async authenticate(authorization?: string): Promise<QqBridgeConnector> {
    const match = /^Bearer (qqb_[a-f0-9]{64})$/.exec(authorization ?? '');
    if (!match) throw new UnauthorizedException('连接器凭据无效。');
    const connector = await this.prisma.qqBridgeConnector.findUnique({
      where: { tokenHash: hashBridgeSecret(match[1]) },
    });
    if (!connector || connector.revokedAt) throw new UnauthorizedException('连接器凭据已失效。');
    return connector;
  }

  async activeBinding(
    tx: Prisma.TransactionClient,
    connectorId: string,
    bindingId: string,
    revision: number,
  ) {
    // Every mutation of connector/binding state takes these locks in the same order.
    await tx.$queryRaw`SELECT id FROM "QqBridgeConnector" WHERE id = ${connectorId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "QqBridgeBinding" WHERE id = ${bindingId} FOR UPDATE`;
    const binding = await tx.qqBridgeBinding.findUnique({
      where: { id: bindingId },
      include: { connector: true },
    });
    if (
      !binding ||
      binding.connectorId !== connectorId ||
      binding.archivedAt ||
      !binding.enabled ||
      !binding.connector.enabled ||
      binding.connector.revokedAt
    ) {
      throw new ForbiddenException('群同步未启用或绑定不可用。');
    }
    if (binding.revision !== revision) throw new ConflictException('绑定配置已变化，请刷新配置。');
    const group = await tx.group.findUnique({
      where: { id: binding.groupId },
      include: { server: true },
    });
    if (!group || group.isDM || group.archivedAt || group.server?.archivedAt)
      throw new ForbiddenException('目标群不可用。');
    return binding;
  }

  async createConnector(actor: AuthenticatedUser, name: string) {
    await this.assertAdmin(actor);
    const token = `qqb_${randomBytes(32).toString('hex')}`;
    const connector = await this.prisma.qqBridgeConnector.create({
      data: { name: name.trim(), tokenHash: hashBridgeSecret(token) },
    });
    return { id: connector.id, token };
  }

  async setConnector(actor: AuthenticatedUser, id: string, enabled: boolean, revoke = false) {
    await this.assertAdmin(actor);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QqBridgeConnector" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.qqBridgeConnector.findUniqueOrThrow({ where: { id } });
      if (current.revokedAt) throw new BadRequestException('凭据已撤销，请创建新连接器。');
      await tx.qqBridgeConnector.update({
        where: { id },
        data: {
          enabled: revoke ? false : enabled,
          ...(revoke ? { revokedAt: new Date(), connected: false } : {}),
        },
      });
      if (current.enabled !== enabled || revoke)
        await tx.qqBridgeBinding.updateMany({
          where: { connectorId: id },
          data: { revision: { increment: 1 }, enabledAt: enabled && !revoke ? new Date() : null },
        });
      return { ok: true };
    });
  }

  async createBinding(actor: AuthenticatedUser, dto: BindingDto) {
    await this.assertAdmin(actor);
    await this.assertGroupManager(actor, dto.groupId, true);
    const connector = await this.prisma.qqBridgeConnector.findUnique({
      where: { id: dto.connectorId },
    });
    if (!connector || connector.revokedAt) throw new BadRequestException('连接器不可用。');
    try {
      return await this.prisma.qqBridgeBinding.create({ data: dto });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('该 QQ 群或 Chat 群已经绑定。');
      throw error;
    }
  }

  async setBinding(actor: AuthenticatedUser, id: string, dto: ToggleBindingDto) {
    await this.assertAdmin(actor);
    const found = await this.prisma.qqBridgeBinding.findUniqueOrThrow({ where: { id } });
    if (found.archivedAt) throw new BadRequestException('此绑定已解除。');
    await this.assertGroupManager(actor, found.groupId, dto.enabled);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QqBridgeConnector" WHERE id = ${found.connectorId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "QqBridgeBinding" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.qqBridgeBinding.findUniqueOrThrow({ where: { id } });
      if (current.archivedAt) throw new BadRequestException('此绑定已解除。');
      const binding = await tx.qqBridgeBinding.update({
        where: { id },
        data: {
          enabled: dto.enabled,
          bidirectional: dto.bidirectional,
          revision: { increment: 1 },
          enabledAt: dto.enabled ? new Date() : null,
        },
      });
      if (dto.backlog === 'discard')
        await tx.qqBridgeDelivery.updateMany({
          where: { bindingId: id, status: { in: ['pending', 'claimed'] } },
          data: { status: 'cancelled' },
        });
      if (dto.enabled && dto.bidirectional && dto.backlog === 'resume')
        await tx.qqBridgeDelivery.updateMany({
          where: { bindingId: id, status: { in: ['pending', 'claimed'] } },
          data: {
            revision: binding.revision,
            status: 'pending',
            leaseHash: null,
            leaseUntil: null,
          },
        });
      return binding;
    });
  }

  async archiveBinding(actor: AuthenticatedUser, id: string) {
    await this.assertAdmin(actor);
    const found = await this.prisma.qqBridgeBinding.findUniqueOrThrow({ where: { id } });
    await this.assertGroupManager(actor, found.groupId);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "QqBridgeConnector" WHERE id = ${found.connectorId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "QqBridgeBinding" WHERE id = ${id} FOR UPDATE`;
      const current = await tx.qqBridgeBinding.findUniqueOrThrow({ where: { id } });
      if (current.enabled) throw new BadRequestException('请先暂停绑定再解除。');
      if (
        await tx.qqBridgeDelivery.count({
          where: { bindingId: id, status: { in: ['started', 'uncertain'] } },
        })
      )
        throw new BadRequestException('请先核对并处理发送结果不明的任务。');
      await tx.qqBridgeDelivery.updateMany({
        where: { bindingId: id, status: { in: ['pending', 'claimed'] } },
        data: { status: 'cancelled' },
      });
      await tx.qqBridgeBinding.update({
        where: { id },
        data: { archivedAt: new Date(), revision: { increment: 1 } },
      });
      return { ok: true };
    });
  }

  async overview(actor: AuthenticatedUser) {
    await this.assertAdmin(actor);
    const manageable = await this.prisma.group.findMany({
      where: {
        isDM: false,
        ...(actor.role === 'SUPER_ADMIN'
          ? {}
          : {
              OR: [
                { createdById: actor.sub },
                { members: { some: { userId: actor.sub, role: 'ADMIN' as const } } },
              ],
            }),
      },
      select: {
        id: true,
        name: true,
        category: true,
        archivedAt: true,
        server: { select: { archivedAt: true } },
      },
      orderBy: { name: 'asc' },
    });
    const groupIds = manageable.map((group) => group.id);
    await this.prisma.qqBridgeDelivery.updateMany({
      where: { status: 'started', leaseUntil: { lt: new Date() } },
      data: { status: 'uncertain', errorCode: 'result-unknown' },
    });
    const [connectors, bindings, deliveries] = await Promise.all([
      this.prisma.qqBridgeConnector.findMany({
        select: {
          id: true,
          name: true,
          enabled: true,
          revokedAt: true,
          lastSeenAt: true,
          connected: true,
          catalog: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.qqBridgeBinding.findMany({
        where: { archivedAt: null, groupId: { in: groupIds } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.qqBridgeDelivery.findMany({
        where: {
          binding: { groupId: { in: groupIds } },
          OR: [{ status: { not: 'sent' } }, { errorCode: { not: null } }],
        },
        select: {
          id: true,
          bindingId: true,
          action: true,
          status: true,
          errorCode: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    ]);
    return {
      extension: { id: 'qq-bridge', name: 'QQ 群同步', version: 1 },
      connectors,
      bindings,
      deliveries,
      groups: manageable
        .filter((group) => !group.archivedAt && !group.server?.archivedAt)
        .map(({ id, name, category }) => ({ id, name, category })),
    };
  }
}
