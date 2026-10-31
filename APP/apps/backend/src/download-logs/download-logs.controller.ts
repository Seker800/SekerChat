import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { DownloadLogDto } from './download-log.dto';
import { DownloadLogService } from './download-log.service';

@ApiTags('download-logs')
@UseGuards(JwtAuthGuard)
@Controller('download-logs')
export class DownloadLogsController {
  constructor(private readonly logs: DownloadLogService) {}

  @Post()
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Accepted as untrusted client diagnostic data.' })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  record(@CurrentUser() user: AuthenticatedUser, @Body() dto: DownloadLogDto): void {
    if (
      (dto.firstByteMs !== null &&
        dto.firstByteMs !== undefined &&
        dto.firstByteMs > dto.elapsedMs) ||
      dto.maxGapMs > dto.elapsedMs
    ) {
      throw new BadRequestException('Invalid download timing.');
    }
    const transferMs = dto.firstByteMs == null ? 0 : dto.elapsedMs - dto.firstByteMs;
    this.logs.record({
      source: 'client_reported',
      userId: user.sub,
      ...dto,
      averageBytesPerSecond:
        transferMs > 0 && dto.cacheStatus !== 'browser_cache'
          ? Math.round((dto.bytes * 1000) / transferMs)
          : null,
    });
  }
}
