import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PERMISSION_LABELS, type SystemPermission } from '@sekerchat/shared';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';
import { AvatarsService } from '../avatars/avatars.service';
import { resolveActorType } from '../common/bot-identity';
import { PrismaService } from '../prisma/prisma.service';
import { UserRealtimeGateway } from '../realtime/user-realtime-gateway.service';
import { PermissionConfigService } from '../system-config/permission-config.service';

@Injectable()
export class CurrentUserService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly avatarsService: AvatarsService,
    private readonly realtimeGateway: UserRealtimeGateway,
    private readonly permissionConfigService: PermissionConfigService,
  ) {}

  disconnectRealtimeSessions(userId: string): number {
    return this.realtimeGateway.disconnectSessions(userId);
  }

  async getCurrentUser(userId: string) {
    const user = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
        role: true,
        isBot: true,
        createdAt: true,
        dndUntil: true,
        mustChangePassword: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const rolePermissions = await this.permissionConfigService.getRolePermissions();
    const permissions =
      user.role === 'SUPER_ADMIN'
        ? (Object.keys(PERMISSION_LABELS) as SystemPermission[])
        : (rolePermissions[user.role] ?? []);

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: this.avatarsService.buildUserAvatarUrl(user.id, user.avatarStorageKey),
      actorType: resolveActorType(user),
      role: user.role,
      permissions,
      createdAt: user.createdAt,
      dndUntil: user.dndUntil,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.prismaService.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found.');
    }

    const user = await this.prismaService.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        dndUntil:
          dto.dndUntil !== undefined ? (dto.dndUntil ? new Date(dto.dndUntil) : null) : undefined,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarStorageKey: true,
        role: true,
        createdAt: true,
        dndUntil: true,
      },
    });

    if (dto.dndUntil !== undefined) {
      this.realtimeGateway.publishDndChanged(userId, user.dndUntil);
    }

    return {
      ...user,
      avatarUrl: user.avatarStorageKey
        ? this.avatarsService.buildUserAvatarUrl(user.id, user.avatarStorageKey)
        : null,
    };
  }
}
