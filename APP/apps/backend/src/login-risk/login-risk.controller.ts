import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionService } from '../system-config/permission.service';
import { LoginRiskService } from './login-risk.service';
import { UnbanDto } from './dto/unban.dto';

@UseGuards(JwtAuthGuard)
@Controller('admin/bans')
export class LoginRiskController {
  constructor(
    private readonly loginRiskService: LoginRiskService,
    private readonly permissionService: PermissionService,
  ) {}

  private async ensurePermission(user: AuthenticatedUser) {
    if (user.role === 'SUPER_ADMIN') {
      return;
    }
    await this.permissionService.assertPermission(user.role, 'manage_bans');
  }

  @Get()
  async listBlacklist(
    @CurrentUser() user: AuthenticatedUser,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    await this.ensurePermission(user);
    return this.loginRiskService.getBlacklist({
      search,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post(':id/unban')
  async unbanEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UnbanDto,
  ) {
    await this.ensurePermission(user);
    return this.loginRiskService.unblacklist(id, user.sub, dto.note);
  }
}
