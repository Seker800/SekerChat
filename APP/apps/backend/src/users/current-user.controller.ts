import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CapabilitiesService } from '../system-config/capabilities.service';
import { CurrentUserService } from './current-user.service';

@UseGuards(JwtAuthGuard)
@Controller('users/me')
export class CurrentUserController {
  constructor(
    private readonly currentUserService: CurrentUserService,
    private readonly capabilitiesService: CapabilitiesService,
  ) {}

  @Get()
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.currentUserService.getCurrentUser(user.sub);
  }

  @Get('capabilities')
  getCapabilities(@CurrentUser() user: AuthenticatedUser) {
    return this.capabilitiesService.getCapabilities(user.sub);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.currentUserService.updateProfile(user.sub, dto);
  }
}
