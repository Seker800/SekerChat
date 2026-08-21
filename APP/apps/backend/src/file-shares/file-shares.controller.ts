import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsISO8601, Matches } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { FileSharesService } from './file-shares.service';
import { MANAGED_FILE_SHARE_PASSWORD_PATTERN } from './file-share-password-policy';

class SaveFileShareDto {
  @Matches(MANAGED_FILE_SHARE_PASSWORD_PATTERN)
  password!: string;

  @IsISO8601()
  expiresAt!: string;
}

class RotateFileShareDto {
  @Matches(MANAGED_FILE_SHARE_PASSWORD_PATTERN)
  password!: string;
}

@UseGuards(JwtAuthGuard)
@Controller('groups/:groupId/files/:fileId/share')
export class FileSharesController {
  constructor(private readonly fileSharesService: FileSharesService) {}

  @Get()
  get(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string, @Param('fileId') fileId: string) {
    return this.fileSharesService.getManagedShare(user.sub, groupId, fileId);
  }

  @Patch()
  save(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string, @Param('fileId') fileId: string, @Body() body: SaveFileShareDto) {
    return this.fileSharesService.upsertManagedShare(user.sub, groupId, fileId, body);
  }

  @Post('rotate')
  rotate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('fileId') fileId: string,
    @Body() body: RotateFileShareDto,
  ) {
    return this.fileSharesService.rotateManagedShare(user.sub, groupId, fileId, body);
  }

  @Delete()
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string, @Param('fileId') fileId: string) {
    return this.fileSharesService.revokeManagedShare(user.sub, groupId, fileId);
  }
}
