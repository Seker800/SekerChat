import { Body, Controller, ForbiddenException, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { hasSystemPermission } from '@sekerchat/shared';
import { UpdateSystemConfigDto } from './dto/update-system-config.dto';
import { SystemConfigService } from './system-config.service';

@UseGuards(JwtAuthGuard)
@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly systemConfigService: SystemConfigService) {}

  @Get()
  getAll(@CurrentUser() user: AuthenticatedUser) {
    return this.systemConfigService.getVisibleConfig(user);
  }

  @Get('storage-stats')
  async getStorageStats(@CurrentUser() user: AuthenticatedUser) {
    if (user.role !== 'SUPER_ADMIN') {
      const rp = await this.systemConfigService.getRolePermissions();
      if (!hasSystemPermission(rp, user.role, 'manage_system_config')) {
        throw new ForbiddenException('Insufficient permissions.');
      }
    }
    return this.systemConfigService.getStorageStats();
  }

  @Patch()
  async updateConfig(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSystemConfigDto) {
    if (user.role !== 'SUPER_ADMIN') {
      const rp = await this.systemConfigService.getRolePermissions();
      if (!hasSystemPermission(rp, user.role, 'manage_system_config')) {
        throw new ForbiddenException('Insufficient permissions.');
      }
    }
    return this.systemConfigService.updateConfig(user, dto);
  }
}
