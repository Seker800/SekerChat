import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionService } from '../system-config/permission.service';
import { PresenceLogService } from './presence-log.service';

@Controller('presence-logs')
@UseGuards(JwtAuthGuard)
export class PresenceLogController {
  constructor(
    private readonly presenceLogService: PresenceLogService,
    private readonly permissionService: PermissionService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('userId') userId?: string,
    @Query('event') event?: string,
  ) {
    if (user.role !== 'SUPER_ADMIN') {
      await this.permissionService.assertPermission(user.role, 'view_presence_logs');
    }

    return this.presenceLogService.list({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      userId,
      event,
    });
  }
}
