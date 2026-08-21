import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PermissionService } from '../system-config/permission.service';
import { UserRealtimeGateway } from '../realtime/user-realtime-gateway.service';
import { UsersService } from './users.service';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionService: PermissionService,
    private readonly realtimeGateway: UserRealtimeGateway,
  ) {}

  private async ensurePermission(user: AuthenticatedUser, permission: 'view_user_directory' | 'manage_user_roles') {
    if (user.role === 'SUPER_ADMIN') {
      return;
    }

    await this.permissionService.assertPermission(user.role, permission);
  }

  @Get()
  async listUsers(@CurrentUser() user: AuthenticatedUser) {
    await this.ensurePermission(user, 'view_user_directory');
    return this.usersService.listUsers(user);
  }

  @Get('dm-candidates')
  listDMCandidates(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.listDMCandidates(user);
  }

  @Patch(':userId/role')
  async updateUserRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    await this.ensurePermission(user, 'manage_user_roles');
    return this.usersService.updateUserRole(user, userId, dto.role);
  }

  @Delete(':userId')
  async deleteUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ) {
    await this.ensurePermission(user, 'manage_user_roles');
    await this.usersService.deleteUser(user, userId);
    return { success: true };
  }

  @Patch(':userId/disabled')
  async setUserDisabled(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: { disabled: boolean },
  ) {
    await this.ensurePermission(user, 'manage_user_roles');
    return this.usersService.setUserDisabled(user, userId, Boolean(dto.disabled));
  }

  @Patch(':userId/password')
  async resetUserPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    await this.ensurePermission(user, 'manage_user_roles');
    await this.usersService.resetUserPassword(user, userId, dto.newPassword);
    this.realtimeGateway.disconnectSessions(userId);
    return { success: true };
  }
}
