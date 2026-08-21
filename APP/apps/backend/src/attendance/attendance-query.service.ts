import { ForbiddenException, Injectable } from '@nestjs/common';
import { AttendanceMode } from '@prisma/client';
import { hasSystemPermission } from '@sekerchat/shared';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionConfigService } from '../system-config/permission-config.service';

@Injectable()
export class AttendanceQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionConfigService,
  ) {}

  async listVisibleUsers(actor: AuthenticatedUser) {
    const rolePermissions = await this.permissions.getRolePermissions();
    if (
      actor.role !== 'SUPER_ADMIN' &&
      !hasSystemPermission(rolePermissions, actor.role, 'view_user_directory')
    ) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    return this.listActiveHumanUsers();
  }

  async listActiveHumanUsers() {
    const users = await this.prisma.user.findMany({
      where: {
        disabledAt: null,
        isBot: false,
      },
      orderBy: [{ role: 'desc' }, { displayName: 'asc' }, { email: 'asc' }],
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
      },
    });

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      attendanceMode: AttendanceMode.FLEXIBLE,
    }));
  }
}
