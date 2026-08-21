import { ForbiddenException, Injectable } from '@nestjs/common';
import { hasSystemPermission, type SystemPermission } from '@sekerchat/shared';
import { PermissionConfigService } from './permission-config.service';

@Injectable()
export class PermissionService {
  constructor(private readonly permissionConfigService: PermissionConfigService) {}

  async hasPermission(role: string, permission: SystemPermission): Promise<boolean> {
    const rolePermissions = await this.permissionConfigService.getRolePermissions();
    return hasSystemPermission(rolePermissions, role, permission);
  }

  async assertPermission(role: string, permission: SystemPermission): Promise<void> {
    if (!(await this.hasPermission(role, permission))) {
      throw new ForbiddenException('Insufficient permissions.');
    }
  }
}
