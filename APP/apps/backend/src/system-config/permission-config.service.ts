import { Injectable } from '@nestjs/common';
import { getDefaultRolePermissions, type RolePermissions } from '@sekerchat/shared';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigStoreService } from './system-config-store.service';

@Injectable()
export class PermissionConfigService {
  private cachedRolePermissions: RolePermissions | null = null;

  constructor(private readonly store: SystemConfigStoreService) {}

  async getRolePermissions(): Promise<RolePermissions> {
    if (this.cachedRolePermissions) {
      return this.cachedRolePermissions;
    }

    const raw = await this.store.getValue('rolePermissions');
    if (!raw) {
      this.cachedRolePermissions = getDefaultRolePermissions();
      return this.cachedRolePermissions;
    }

    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Invalid role permissions config shape');
      }

      this.cachedRolePermissions = this.mergeWithDefaults(parsed as RolePermissions);
      return this.cachedRolePermissions;
    } catch {
      this.cachedRolePermissions = getDefaultRolePermissions();
      return this.cachedRolePermissions;
    }
  }

  async updateFromDto(dto: UpdateSystemConfigDto): Promise<void> {
    if (dto.rolePermissions === undefined) {
      return;
    }

    await this.store.upsert('rolePermissions', JSON.stringify(dto.rolePermissions));
    this.cachedRolePermissions = null;
  }

  private mergeWithDefaults(input: RolePermissions): RolePermissions {
    const defaults = getDefaultRolePermissions();
    const merged: RolePermissions = {};

    for (const [role, defaultPermissions] of Object.entries(defaults)) {
      if (role === 'SUPER_ADMIN') {
        merged[role] = [...defaultPermissions];
        continue;
      }

      const configured = Array.isArray(input[role]) ? input[role] : defaultPermissions;
      merged[role] = [...new Set(configured)];
    }

    for (const [role, permissions] of Object.entries(input)) {
      if (merged[role]) {
        continue;
      }

      merged[role] = Array.isArray(permissions) ? [...new Set(permissions)] : [];
    }

    return merged;
  }
}
