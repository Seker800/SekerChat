import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { getNetworkStatus } from './network-status';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('network')
@ApiCookieAuth()
@UseGuards(JwtAuthGuard)
@Controller('network')
export class NetworkController {
  @Get('status')
  @Header('Cache-Control', 'private, no-store')
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['showWarning'],
      properties: { showWarning: { type: 'boolean' } },
    },
  })
  getStatus(@Req() request: Request) {
    // Express resolves this using the existing explicit trusted proxy list.
    // Never accept an IP supplied through a query parameter or arbitrary header.
    return getNetworkStatus(request.ip);
  }
}
