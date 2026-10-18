import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { QqBridgeAccessService } from './qq-bridge-access.service';
import { QqBridgeDeliveryService } from './qq-bridge-delivery.service';
import {
  BindingDto,
  CreateConnectorDto,
  ResolveDeliveryDto,
  ToggleBindingDto,
  ToggleConnectorDto,
  IngestQqMessageDto,
} from './qq-bridge.dto';
import { QqBridgeIngestService } from './qq-bridge-ingest.service';
import {
  QqBridgeOverviewResponseDto,
  QqBridgeCredentialResponseDto,
  QqBridgeBindingResponseDto,
  QqBridgeActionResponseDto,
} from './qq-bridge-response.dto';

@ApiTags('extensions')
@UseGuards(JwtAuthGuard)
@Controller('extensions/qq-bridge')
export class QqBridgeController {
  constructor(
    private readonly access: QqBridgeAccessService,
    private readonly deliveries: QqBridgeDeliveryService,
    private readonly ingest: QqBridgeIngestService,
  ) {}
  @Get()
  @ApiOkResponse({ type: QqBridgeOverviewResponseDto })
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.access.overview(user);
  }
  @Post('connectors')
  @ApiCreatedResponse({ type: QqBridgeCredentialResponseDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateConnectorDto) {
    return this.access.createConnector(user, dto.name);
  }
  @Patch('connectors/:id')
  @ApiOkResponse({ type: QqBridgeActionResponseDto })
  toggle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ToggleConnectorDto,
  ) {
    return this.access.setConnector(user, id, dto.enabled);
  }
  @Post('connectors/:id/revoke')
  @ApiCreatedResponse({ type: QqBridgeActionResponseDto })
  revoke(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.access.setConnector(user, id, false, true);
  }
  @Post('bindings')
  @ApiCreatedResponse({ type: QqBridgeBindingResponseDto })
  bind(@CurrentUser() user: AuthenticatedUser, @Body() dto: BindingDto) {
    return this.access.createBinding(user, dto);
  }
  @Patch('bindings/:id')
  @ApiOkResponse({ type: QqBridgeBindingResponseDto })
  toggleBinding(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ToggleBindingDto,
  ) {
    return this.access.setBinding(user, id, dto);
  }
  @Post('bindings/:id/archive')
  @ApiCreatedResponse({ type: QqBridgeActionResponseDto })
  archiveBinding(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.access.archiveBinding(user, id);
  }
  @Post('deliveries/:id/resolve')
  @ApiCreatedResponse({ type: QqBridgeActionResponseDto })
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveDeliveryDto,
  ) {
    return this.deliveries.resolve(user, id, dto.status, dto.messageId);
  }

  @Post('bindings/:id/history')
  @ApiCreatedResponse({ type: QqBridgeActionResponseDto })
  async importHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: IngestQqMessageDto,
  ) {
    await this.ingest.importHistory(user, id, dto);
    return { ok: true };
  }
}
