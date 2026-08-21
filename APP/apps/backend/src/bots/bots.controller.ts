import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { AvatarsService } from '../avatars/avatars.service';
import { PermissionService } from '../system-config/permission.service';
import { BotsService } from './bots.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class BotsPublicController {
  constructor(private readonly botsService: BotsService) {}

  @Get('bots')
  listBots() {
    return this.botsService.listPublicChatBots();
  }
}

@UseGuards(JwtAuthGuard)
@Controller('admin/bots')
export class BotsController {
  constructor(
    private readonly botsService: BotsService,
    private readonly permissionService: PermissionService,
    private readonly avatarsService: AvatarsService,
  ) {}

  private async ensurePermission(user: AuthenticatedUser) {
    if (user.role === 'SUPER_ADMIN') return;
    await this.permissionService.assertPermission(user.role, 'manage_system_config');
  }

  @Get()
  async listBots(@CurrentUser() user: AuthenticatedUser) {
    await this.ensurePermission(user);
    return this.botsService.listBots();
  }

  @Post()
  async createBot(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBotDto) {
    await this.ensurePermission(user);
    return this.botsService.createBot(dto);
  }

  @Patch(':botId')
  async updateBot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId') botId: string,
    @Body() dto: UpdateBotDto,
  ) {
    await this.ensurePermission(user);
    return this.botsService.updateBot(botId, dto);
  }

  @Delete(':botId')
  async deleteBot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId') botId: string,
  ) {
    await this.ensurePermission(user);
    return this.botsService.deleteBot(botId);
  }

  @Post(':botId/avatar')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
  }))
  async uploadBotAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId') botId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    await this.ensurePermission(user);
    await this.botsService.assertBotExists(botId);
    return this.avatarsService.uploadUserAvatar(botId, file);
  }
}
