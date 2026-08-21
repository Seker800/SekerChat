import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AttendanceMode } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AttendanceConfigService } from '../system-config/attendance-config.service';
import { PermissionService } from '../system-config/permission.service';
import { AttendanceService } from './attendance.service';
import { UpdateAttendanceConfigDto } from './dto/update-attendance-config.dto';
import { UpdateAttendancePolicyDto } from './dto/update-attendance-policy.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceConfigService: AttendanceConfigService,
    private readonly permissionService: PermissionService,
  ) {}

  private async ensureViewAccess(user: AuthenticatedUser) {
    if (user.role === 'SUPER_ADMIN') {
      return;
    }
    await this.permissionService.assertPermission(user.role, 'view_presence_logs');
  }

  @Get('daily')
  async listDaily(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('userId') userId?: string,
    @Query('workDate') workDate?: string,
    @Query('mode') mode?: AttendanceMode,
  ) {
    await this.ensureViewAccess(user);
    return this.attendanceService.listDailySummaries({
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      offset: offset ? Number.parseInt(offset, 10) : undefined,
      userId,
      workDate,
      mode,
    });
  }

  @Get('users')
  async listUsers(@CurrentUser() user: AuthenticatedUser) {
    await this.ensureViewAccess(user);
    return this.attendanceService.listUsersWithAttendanceMode(user);
  }

  @Get('users/stats')
  async listUserStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workDate') workDate?: string,
  ) {
    await this.ensureViewAccess(user);
    return this.attendanceService.listUserStats(user, workDate);
  }

  @Get('users/averages')
  async listUserAverages(@CurrentUser() user: AuthenticatedUser) {
    await this.ensureViewAccess(user);
    return this.attendanceService.listUserAttendanceAverages();
  }

  @Get('me/stats')
  async getOwnStats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workDate') workDate?: string,
  ) {
    return this.attendanceService.getOwnStats(user, workDate);
  }

  @Get('me/panel')
  async getOwnPanel(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: string,
  ) {
    return this.attendanceService.getOwnPanel(
      user,
      days ? Number.parseInt(days, 10) : undefined,
    );
  }

  @Get('me/checkin/today')
  async getOwnCheckInToday(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.getOwnCheckInToday(user);
  }

  @Post('me/checkin/dev/reset-today')
  async resetOwnCheckInTodayForDev(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.resetOwnCheckInTodayForDev(user);
  }

  @Post('me/checkin')
  async checkIn(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.checkIn(user);
  }

  @Post('me/checkout')
  async checkOut(@CurrentUser() user: AuthenticatedUser) {
    return this.attendanceService.checkOut(user);
  }

  @Get('me/checkin/panel')
  async getOwnCheckInPanel(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days') days?: string,
  ) {
    return this.attendanceService.getOwnCheckInPanel(
      user,
      days ? Number.parseInt(days, 10) : undefined,
    );
  }

  @Get('users/:userId/stats')
  async getUserStats(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Query('workDate') workDate?: string,
  ) {
    await this.ensureViewAccess(user);
    return this.attendanceService.getUserStats(userId, workDate);
  }

  @Patch('config')
  async updateAttendanceConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAttendanceConfigDto,
  ) {
    await this.ensureViewAccess(user);
    await this.attendanceConfigService.updateFromDto(dto);
    const shouldRecomputeAttendance =
      dto.attendanceTimezone !== undefined ||
      dto.attendanceActiveWindowMinutes !== undefined;

    if (shouldRecomputeAttendance) {
      await this.attendanceService.recomputeAllUsers();
    }

    return this.attendanceConfigService.getRawConfig();
  }

  @Patch('users/:userId/mode')
  async updateMode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: UpdateAttendancePolicyDto,
  ) {
    await this.ensureViewAccess(user);
    return this.attendanceService.updateUserMode(user, userId, dto.mode);
  }
}
