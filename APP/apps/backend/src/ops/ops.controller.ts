import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { SetGroupWorkStateDto } from './dto/set-group-work-state.dto';
import { OpsService } from './ops.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class OpsController {
  constructor(private readonly opsService: OpsService) {}

  @Get('groups/:groupId/work-state')
  getGroupWorkState(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.opsService.getGroupWorkState(user.sub, groupId);
  }

  @Get('groups/:groupId/work-state/history')
  getGroupWorkStateHistory(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.opsService.getGroupWorkStateHistory(user.sub, groupId);
  }

  @Patch('groups/:groupId/work-state')
  setGroupWorkState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Body() dto: SetGroupWorkStateDto,
  ) {
    return this.opsService.setGroupWorkState(user, groupId, dto, {
      actorType: user.actorType,
    });
  }
}
