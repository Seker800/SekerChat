import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { ArchiveServerDto } from './dto/archive-server.dto';
import { ArchiveServerResponseDto, ServerResponseDto } from './dto/server-response.dto';
import { UpdateServerDto } from './dto/update-server.dto';
import { ServersService } from './servers.service';

@UseGuards(JwtAuthGuard)
@ApiTags('servers')
@Controller('servers')
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  @Get()
  @ApiOkResponse({ type: ServerResponseDto, isArray: true })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.serversService.listForUser(user);
  }

  @Patch(':serverId')
  @ApiOkResponse({ type: ServerResponseDto })
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body() dto: UpdateServerDto,
  ) {
    return this.serversService.rename(user, serverId, dto.name);
  }

  @Patch(':serverId/archive')
  @ApiOkResponse({ type: ArchiveServerResponseDto })
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body() dto: ArchiveServerDto,
  ) {
    return this.serversService.archive(user, serverId, dto.archive ?? true);
  }
}
