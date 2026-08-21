import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DmService } from './dm.service';

interface CreateOrGetDmDto {
  targetUserId: string;
}

@UseGuards(JwtAuthGuard)
@Controller('dm')
export class DmController {
  constructor(private readonly dmService: DmService) {}

  @Get()
  listDMs(@CurrentUser() user: AuthenticatedUser) {
    return this.dmService.listDMs(user.sub);
  }

  @Post()
  createOrGetDM(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrGetDmDto,
  ) {
    return this.dmService.createOrGetDM(user.sub, dto.targetUserId);
  }
}
