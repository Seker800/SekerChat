import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { isAgentBot } from '../common/bot-identity';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AvatarsService } from '../avatars/avatars.service';
import { hasSystemPermission } from '@sekerchat/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionConfigService } from '../system-config/permission-config.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly avatarsService: AvatarsService,
    private readonly permissionConfigService: PermissionConfigService,
  ) {}

  async listUsers(actor: AuthenticatedUser) {
    const users = await this.prismaService.user.findMany({
      where: {
        isBot: false,
      },
      orderBy: [{ role: 'desc' }, { displayName: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
        role: true,
        createdAt: true,
        disabledAt: true,
        dndUntil: true,
        mustChangePassword: true,
      },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      createdAt: user.createdAt,
      disabledAt: user.disabledAt,
      dndUntil: user.dndUntil,
      mustChangePassword: user.mustChangePassword,
      avatarUrl: this.avatarsService.buildUserAvatarUrl(user.id, user.avatarStorageKey),
    }));
  }

  async listDMCandidates(actor: AuthenticatedUser) {
    const users = await this.prismaService.user.findMany({
      where: {
        id: {
          not: actor.sub,
        },
        disabledAt: null,
        OR: [
          {
            isBot: false,
          },
          {
            role: UserRole.CLI_BOT,
            isBot: true,
          },
        ],
      },
      orderBy: [{ displayName: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
        role: true,
        isBot: true,
        botConfig: true,
      },
    });

    const isAdmin = actor.role === 'ADMIN' || actor.role === 'SUPER_ADMIN';

    return users
      .filter((user) => {
        if (!isAgentBot(user)) return true;
        if (isAdmin) return true;
        const allowed = (user.botConfig as any)?.allowedUserIds as string[] | undefined;
        if (!allowed || allowed.length === 0) return true;
        return allowed.includes(actor.sub);
      })
      .map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: this.avatarsService.buildUserAvatarUrl(user.id, user.avatarStorageKey),
      }));
  }

  async updateUserRole(actor: AuthenticatedUser, targetUserId: string, nextRole: UserRole) {
    const rp = await this.permissionConfigService.getRolePermissions();
    if (!hasSystemPermission(rp, actor.role, 'manage_user_roles')) {
      throw new ForbiddenException('仅管理员可以修改用户角色。');
    }

    const targetUser = await this.prismaService.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    this.assertNotBotUser(targetUser);

    if (targetUser.id === actor.sub) {
      throw new BadRequestException('不能修改自己的角色。');
    }

    if (targetUser.role === nextRole) {
      return targetUser;
    }

    // Only super admins can manage other admins or promote users to admin.
    if (
      targetUser.role === UserRole.ADMIN ||
      targetUser.role === UserRole.SUPER_ADMIN ||
      nextRole === UserRole.ADMIN ||
      nextRole === UserRole.SUPER_ADMIN
    ) {
      if (actor.role !== UserRole.SUPER_ADMIN) {
        throw new ForbiddenException('只有超级管理员才能管理管理员。');
      }
    }

    // Never allow demoting or removing the last super admin.
    if (
      targetUser.role === UserRole.SUPER_ADMIN &&
      nextRole !== UserRole.SUPER_ADMIN
    ) {
      const superAdminCount = await this.prismaService.user.count({
        where: {
          role: UserRole.SUPER_ADMIN,
          disabledAt: null,
        },
      });
      if (superAdminCount <= 1) {
        throw new BadRequestException('至少需要保留一位超级管理员。');
      }
    }

    if (targetUser.role === UserRole.ADMIN && nextRole === UserRole.MEMBER) {
      const adminCount = await this.prismaService.user.count({
        where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }, disabledAt: null },
      });

      if (adminCount <= 1) {
        throw new BadRequestException('至少需要保留一位管理员。');
      }
    }

    return this.prismaService.user.update({
      where: { id: targetUserId },
      data: { role: nextRole },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        disabledAt: true,
        dndUntil: true,
      },
    });
  }

  async deleteUser(actor: AuthenticatedUser, targetUserId: string) {
    const rp = await this.permissionConfigService.getRolePermissions();
    if (!hasSystemPermission(rp, actor.role, 'manage_user_roles')) {
      throw new ForbiddenException('仅管理员可以删除用户。');
    }

    const targetUser = await this.prismaService.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    this.assertNotBotUser(targetUser);

    if (targetUser.id === actor.sub) {
      throw new BadRequestException('不能删除自己。');
    }

    if (targetUser.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('不能删除超级管理员。');
    }

    if (targetUser.role === UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('只有超级管理员才能删除管理员。');
    }

    if (targetUser.role === UserRole.ADMIN) {
      const adminCount = await this.prismaService.user.count({
        where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }, disabledAt: null },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('至少需要保留一位管理员。');
      }
    }

    await this.prismaService.user.update({
      where: { id: targetUser.id },
      data: {
        email: `deleted-${targetUser.id}@deleted.local`,
        displayName: null,
        passwordHash: null,
        avatarStorageKey: null,
        oidcProvider: null,
        oidcSubject: null,
        disabledAt: new Date(),
      },
    });

    await this.prismaService.refreshToken.updateMany({
      where: { userId: targetUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prismaService.reminderDeviceToken.updateMany({
      where: { userId: targetUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async setUserDisabled(actor: AuthenticatedUser, targetUserId: string, disabled: boolean) {
    const rp = await this.permissionConfigService.getRolePermissions();
    if (!hasSystemPermission(rp, actor.role, 'manage_user_roles')) {
      throw new ForbiddenException('仅管理员可以停用用户。');
    }

    const targetUser = await this.prismaService.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStorageKey: true,
        disabledAt: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }

    this.assertNotBotUser(targetUser);

    if (targetUser.id === actor.sub) {
      throw new BadRequestException('不能停用自己。');
    }

    if (targetUser.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('不能停用超级管理员。');
    }

    if (targetUser.role === UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('只有超级管理员才能停用管理员。');
    }

    if (targetUser.role === UserRole.ADMIN && disabled) {
      const adminCount = await this.prismaService.user.count({
        where: {
          role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
          disabledAt: null,
        },
      });
      if (adminCount <= 1) {
        throw new BadRequestException('至少需要保留一位启用中的管理员。');
      }
    }

    const updated = await this.prismaService.user.update({
      where: { id: targetUserId },
      data: {
        disabledAt: disabled ? new Date() : null,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        createdAt: true,
        avatarStorageKey: true,
        disabledAt: true,
        dndUntil: true,
      },
    });

    if (disabled) {
      await this.prismaService.refreshToken.updateMany({
        where: {
          userId: updated.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      await this.prismaService.reminderDeviceToken.updateMany({
        where: {
          userId: updated.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      role: updated.role,
      createdAt: updated.createdAt,
      disabledAt: updated.disabledAt,
      dndUntil: updated.dndUntil,
      avatarUrl: this.avatarsService.buildUserAvatarUrl(updated.id, updated.avatarStorageKey),
    };
  }

  async resetUserPassword(actor: AuthenticatedUser, targetUserId: string, newPassword: string) {
    const rp = await this.permissionConfigService.getRolePermissions();
    if (!hasSystemPermission(rp, actor.role, 'manage_user_roles')) {
      throw new ForbiddenException('仅管理员可以重置用户密码。');
    }

    const targetUser = await this.prismaService.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        role: true,
        isBot: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found.');
    }
    this.assertNotBotUser(targetUser);
    if (targetUser.id === actor.sub) {
      throw new BadRequestException('请在个人设置中修改自己的密码。');
    }
    if (targetUser.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('不能重置超级管理员的密码。');
    }
    if (targetUser.role === UserRole.ADMIN && actor.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('只有超级管理员才能重置管理员密码。');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prismaService.$transaction([
      this.prismaService.user.update({
        where: { id: targetUserId },
        data: {
          passwordHash,
          mustChangePassword: true,
          authVersion: { increment: 1 },
        },
      }),
      this.prismaService.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prismaService.reminderDeviceToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private assertNotBotUser(targetUser: { role: UserRole; isBot?: boolean | null }) {
    if (targetUser.isBot || targetUser.role === UserRole.CLI_BOT) {
      throw new BadRequestException('Agent Bot 请在 Bot 管理中维护。');
    }
  }
}
