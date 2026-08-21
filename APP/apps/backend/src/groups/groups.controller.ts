import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ArchiveCategoryDto } from './dto/archive-category.dto';
import { AdvanceReadCursorDto } from './dto/advance-read-cursor.dto';
import { ArchiveGroupDto } from './dto/archive-group.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { InviteGroupMemberDto } from './dto/invite-group-member.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { RenameCategoryDto } from './dto/rename-category.dto';
import { AdminGroupDiscoveryScope, GroupsService } from './groups.service';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AdminDiscoverableGroupResponseDto,
  AdvanceReadCursorResponseDto,
  ArchiveCategoryResponseDto,
  GroupResponseDto,
  LeaveGroupResponseDto,
  ManageableCategoryResponseDto,
  MarkGroupReadResponseDto,
  RenameCategoryResponseDto,
  ResetCategoryResponseDto,
  UserOptionResponseDto,
} from './dto/group-response.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('groups')
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post()
  @ApiCreatedResponse({ type: GroupResponseDto })
  createGroup(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGroupDto) {
    return this.groupsService.createGroup(user, dto.name, {
      serverId: dto.serverId,
      category: dto.category,
    });
  }

  @Get()
  @ApiOkResponse({ type: GroupResponseDto, isArray: true })
  listGroups(@CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.listGroups(user.sub, user.role);
  }

  @Get('admin/discovery')
  @ApiOkResponse({ type: AdminDiscoverableGroupResponseDto, isArray: true })
  listAdminDiscoverableGroups(
    @CurrentUser() user: AuthenticatedUser,
    @Query('scope') scope?: AdminGroupDiscoveryScope,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('serverId') serverId?: string,
  ) {
    return this.groupsService.listAdminDiscoverableGroups(
      user,
      scope ?? 'all',
      search,
      category,
      serverId,
    );
  }

  @Get('admin/categories')
  @ApiOkResponse({ type: ManageableCategoryResponseDto, isArray: true })
  listManageableCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.groupsService.listManageableCategories(user);
  }

  @Patch('admin/categories/archive')
  @ApiOkResponse({ type: ArchiveCategoryResponseDto })
  archiveCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: ArchiveCategoryDto) {
    return this.groupsService.archiveCategory(user, dto.category, dto.archive ?? true);
  }

  @Patch('admin/categories')
  @ApiOkResponse({ type: RenameCategoryResponseDto })
  renameCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: RenameCategoryDto) {
    return this.groupsService.renameCategory(user, dto.from, dto.to);
  }

  @Delete('admin/categories')
  @ApiOkResponse({ type: ResetCategoryResponseDto })
  resetCategory(@CurrentUser() user: AuthenticatedUser, @Query('name') categoryName?: string) {
    return this.groupsService.resetCategory(user, categoryName);
  }

  @Post(':groupId/admin/join')
  @ApiCreatedResponse({ type: GroupResponseDto })
  adminJoinGroup(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.groupsService.adminJoinGroup(user, groupId);
  }

  @Get(':groupId')
  @ApiOkResponse({ type: GroupResponseDto })
  getGroup(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.groupsService.getGroup(user.sub, groupId, user.role);
  }

  @Get(':groupId/invite-candidates')
  @ApiOkResponse({ type: UserOptionResponseDto, isArray: true })
  listInviteCandidates(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.groupsService.listInviteCandidates(user, groupId);
  }

  @Patch(':groupId')
  @ApiOkResponse({ type: GroupResponseDto })
  updateGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.updateGroup(user, groupId, dto);
  }

  @Post(':groupId/members')
  @ApiCreatedResponse({ type: GroupResponseDto })
  inviteMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: InviteGroupMemberDto,
  ) {
    return this.groupsService.inviteMember(user, groupId, dto.email);
  }

  @Patch(':groupId/members/:memberUserId/role')
  @ApiOkResponse({ type: GroupResponseDto })
  updateMemberRole(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('memberUserId') memberUserId: string,
    @Body() dto: UpdateGroupMemberRoleDto,
  ) {
    return this.groupsService.updateMemberRole(user, groupId, memberUserId, dto.role);
  }

  @Delete(':groupId/members/:memberUserId')
  @ApiOkResponse({ type: GroupResponseDto })
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('memberUserId') memberUserId: string,
  ) {
    return this.groupsService.removeMember(user, groupId, memberUserId);
  }

  @Delete(':groupId/leave')
  @ApiOkResponse({ type: LeaveGroupResponseDto })
  leaveGroup(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.groupsService.leaveGroup(user.sub, groupId);
  }

  @Patch(':groupId/archive')
  @ApiOkResponse({ type: GroupResponseDto })
  archiveGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: ArchiveGroupDto,
  ) {
    return this.groupsService.archiveGroup(user, groupId, dto.archive ?? true);
  }

  @Post(':groupId/mark-read')
  @ApiCreatedResponse({ type: MarkGroupReadResponseDto })
  async markGroupRead(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    await this.groupsService.markGroupRead(user.sub, groupId, user.role);
    return { success: true as const };
  }

  @Patch(':groupId/read-cursor')
  @ApiOkResponse({ type: AdvanceReadCursorResponseDto })
  advanceReadCursor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: AdvanceReadCursorDto,
  ) {
    return this.groupsService.advanceReadCursor(user.sub, groupId, BigInt(dto.eventSequence));
  }
}
