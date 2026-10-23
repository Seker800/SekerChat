import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';
import { PrismaService } from '../../prisma/prisma.service';
import { QqBridgeIngestService } from './qq-bridge-ingest.service';
import { QqBridgeDeliveryService } from './qq-bridge-delivery.service';
import { BridgeRequest, QqBridgeGuard } from './qq-bridge.guard';
import {
  DeliveryLeaseDto,
  FinishDeliveryDto,
  HeartbeatDto,
  IngestQqMessageDto,
  MediaUploadDto,
  FileUploadDto,
  RevokeQqMessageDto,
} from './qq-bridge.dto';

@ApiTags('qq-connector')
@UseGuards(QqBridgeGuard)
@Controller('integrations/qq-bridge')
export class QqBridgeConnectorController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingest: QqBridgeIngestService,
    private readonly deliveries: QqBridgeDeliveryService,
  ) {}
  @Get('manifest') async manifest(@Req() request: BridgeRequest) {
    const connector = request.connector;
    const bindings = connector.enabled
      ? await this.prisma.qqBridgeBinding.findMany({
          where: { connectorId: connector.id, enabled: true, archivedAt: null },
        })
      : [];
    const uncertain = await this.prisma.qqBridgeDelivery.findMany({
      where: { binding: { connectorId: connector.id }, status: { in: ['started', 'uncertain'] } },
      select: { bindingId: true },
    });
    return {
      enabled: connector.enabled,
      bindings,
      holdSelfMessages: [...new Set(uncertain.map((t) => t.bindingId))],
    };
  }
  @Post('heartbeat') async heartbeat(@Req() request: BridgeRequest, @Body() dto: HeartbeatDto) {
    const connector = request.connector;
    const now = new Date();
    const catalogChanged =
      dto.groups !== undefined && !isDeepStrictEqual(dto.groups, connector.catalog);
    if (
      connector.connected === dto.connected &&
      !catalogChanged &&
      connector.lastSeenAt &&
      now.getTime() - connector.lastSeenAt.getTime() < 15_000
    ) {
      return { ok: true };
    }
    // Heartbeat observations are replaceable; delivery leases and messages are not.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL synchronous_commit = off`;
      await tx.qqBridgeConnector.update({
        where: { id: request.connector.id },
        data: {
          lastSeenAt: now,
          connected: dto.connected,
          ...(dto.groups ? { catalog: dto.groups as unknown as Prisma.InputJsonValue } : {}),
        },
      });
    });
    return { ok: true };
  }
  @Post('messages') receive(@Req() request: BridgeRequest, @Body() dto: IngestQqMessageDto) {
    return this.ingest.ingest(request.connector.id, dto);
  }
  @Post('recalls') recall(@Req() request: BridgeRequest, @Body() dto: RevokeQqMessageDto) {
    return this.ingest.revoke(request.connector.id, dto);
  }
  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2 },
    }),
  )
  upload(
    @Req() request: BridgeRequest,
    @Body() dto: MediaUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.ingest.upload(request.connector.id, dto, file?.buffer);
  }
  @Post('files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['bindingId', 'revision', 'originalName', 'file'],
      properties: {
        bindingId: { type: 'string', format: 'uuid' },
        revision: { type: 'integer', minimum: 1 },
        originalName: { type: 'string', maxLength: 255 },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      required: ['fileId'],
      properties: { fileId: { type: 'string', format: 'uuid' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 3 },
    }),
  )
  uploadFile(
    @Req() request: BridgeRequest,
    @Body() dto: FileUploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.ingest.uploadFile(request.connector.id, dto, file?.buffer);
  }
  @Post('deliveries/claim') claim(@Req() request: BridgeRequest) {
    return this.deliveries.claim(request.connector.id);
  }
  @Post('deliveries/:id/start') start(
    @Req() request: BridgeRequest,
    @Param('id') id: string,
    @Body() dto: DeliveryLeaseDto,
  ) {
    return this.deliveries.start(request.connector.id, id, dto.lease);
  }
  @Post('deliveries/:id/finish') finish(
    @Req() request: BridgeRequest,
    @Param('id') id: string,
    @Body() dto: FinishDeliveryDto,
  ) {
    return this.deliveries.finish(request.connector.id, id, dto);
  }
  @Get('deliveries/:id/image') async image(
    @Req() request: BridgeRequest,
    @Param('id') id: string,
    @Headers('x-delivery-lease') lease: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.deliveries.image(request.connector.id, id, lease ?? '');
    response.setHeader('Content-Type', result.mimeType);
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(result.stream);
  }
}
