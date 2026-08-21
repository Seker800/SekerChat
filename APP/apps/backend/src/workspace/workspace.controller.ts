import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { WorkspaceBootstrapMode } from '@sekerchat/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { WorkspaceBootstrapService } from './workspace-bootstrap.service';

@UseGuards(JwtAuthGuard)
@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceBootstrapService: WorkspaceBootstrapService) {}

  @Get('bootstrap')
  getBootstrap(
    @CurrentUser() user: AuthenticatedUser,
    @Query('mode') mode?: string,
    @Query('groupId') groupId?: string,
    @Query('dmId') dmId?: string,
    @Query('messageLimit') messageLimit?: string,
  ) {
    return this.workspaceBootstrapService.getBootstrap(user, {
      mode: this.parseMode(mode),
      groupId,
      dmId,
      messageLimit: this.parseMessageLimit(messageLimit),
    });
  }

  private parseMode(mode: string | undefined): WorkspaceBootstrapMode | undefined {
    const normalized = mode?.trim();
    if (!normalized) {
      return undefined;
    }

    if (normalized !== 'server' && normalized !== 'dm') {
      throw new BadRequestException('mode must be server or dm.');
    }

    return normalized;
  }

  private parseMessageLimit(messageLimit: string | undefined): number | undefined {
    if (!messageLimit?.trim()) {
      return undefined;
    }

    const parsed = Number(messageLimit);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('messageLimit must be a valid number.');
    }

    return parsed;
  }
}
