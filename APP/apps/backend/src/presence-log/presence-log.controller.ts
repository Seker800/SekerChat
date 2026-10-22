import { ListPresenceLogsQueryDto } from './presence-log-query.dto';
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
    @Query() query: ListPresenceLogsQueryDto,
  ) {
    if (user.role !== 'SUPER_ADMIN') {
      await this.permissionService.assertPermission(user.role, 'view_presence_logs');
    }

    return this.presenceLogService.list(query);
  }
}
