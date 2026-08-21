import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  StreamableFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AvatarsService } from './avatars.service';

@UseGuards(JwtAuthGuard)
@Controller('avatars')
export class AvatarsController {
  constructor(private readonly avatarsService: AvatarsService) {}

  @Post('users/me')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadUserAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.avatarsService.uploadUserAvatar(user.sub, file);
  }

  @Get('users/:userId/content')
  async getUserAvatarContent(
    @Param('userId') userId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { mimeType, stream } = await this.avatarsService.getUserAvatarStream(userId);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(stream);
  }

  @Post('servers/:category')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadServerAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('category') category: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.avatarsService.uploadServerAvatar(user, decodeURIComponent(category), file);
  }

  @Post('servers/by-id/:serverId')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  uploadServerAvatarById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.avatarsService.uploadServerAvatarById(user, serverId, file);
  }

  @Delete('servers/:category')
  deleteServerAvatar(@CurrentUser() user: AuthenticatedUser, @Param('category') category: string) {
    return this.avatarsService.deleteServerAvatar(user, decodeURIComponent(category));
  }

  @Delete('servers/by-id/:serverId')
  deleteServerAvatarById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
  ) {
    return this.avatarsService.deleteServerAvatarById(user, serverId);
  }

  @Get('servers/:category/content')
  async getServerAvatarContent(
    @Param('category') category: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { mimeType, stream } = await this.avatarsService.getServerAvatarStream(
      decodeURIComponent(category),
    );
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(stream);
  }

  @Get('servers/by-id/:serverId/content')
  async getServerAvatarContentById(
    @Param('serverId') serverId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { mimeType, stream } = await this.avatarsService.getServerAvatarStreamById(serverId);
    response.setHeader('Content-Type', mimeType);
    response.setHeader('Cache-Control', 'private, max-age=300');
    return new StreamableFile(stream);
  }
}
