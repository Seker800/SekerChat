import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { UploadsService } from './uploads.service';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  AbortUploadResponseDto,
  FinalizedArtifactResponseDto,
  FinalizedChatAttachmentResponseDto,
  FinalizedSubscriptionAttachmentResponseDto,
  FinalizedAlbumPhotoResponseDto,
  UploadedPartsResponseDto,
  UploadPartResponseDto,
  UploadSessionResponseDto,
} from './dto/upload-response.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('uploads')
@ApiExtraModels(
  FinalizedChatAttachmentResponseDto,
  FinalizedArtifactResponseDto,
  FinalizedSubscriptionAttachmentResponseDto,
  FinalizedAlbumPhotoResponseDto,
)
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('initiate')
  @ApiCreatedResponse({ type: UploadSessionResponseDto })
  initiateUpload(@CurrentUser() user: AuthenticatedUser, @Body() dto: InitiateUploadDto) {
    return this.uploadsService.initiateUpload(user.sub, dto);
  }

  @Get(':sessionId/parts')
  @ApiOkResponse({ type: UploadedPartsResponseDto })
  getUploadedParts(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.uploadsService.getUploadedParts(user.sub, sessionId);
  }

  @Put(':sessionId/parts/:partNumber')
  @ApiConsumes('application/octet-stream')
  @ApiBody({ schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({ type: UploadPartResponseDto })
  uploadPart(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Param('partNumber', ParseIntPipe) partNumber: number,
    @Req() request: RawBodyRequest<Request>,
  ) {
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.from(request.body ?? '');
    return this.uploadsService.uploadPart(user.sub, sessionId, partNumber, body);
  }

  @Post(':sessionId/complete')
  @ApiCreatedResponse({
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/FinalizedChatAttachmentResponseDto' },
        { $ref: '#/components/schemas/FinalizedArtifactResponseDto' },
        { $ref: '#/components/schemas/FinalizedSubscriptionAttachmentResponseDto' },
        { $ref: '#/components/schemas/FinalizedAlbumPhotoResponseDto' },
      ],
      discriminator: {
        propertyName: 'kind',
        mapping: {
          CHAT_ATTACHMENT: '#/components/schemas/FinalizedChatAttachmentResponseDto',
          ARTIFACT: '#/components/schemas/FinalizedArtifactResponseDto',
          SUBSCRIPTION_ATTACHMENT:
            '#/components/schemas/FinalizedSubscriptionAttachmentResponseDto',
          ALBUM_PHOTO: '#/components/schemas/FinalizedAlbumPhotoResponseDto',
        },
      },
    },
  })
  completeUpload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.uploadsService.completeUpload(user.sub, sessionId, dto.parts);
  }

  @Delete(':sessionId')
  @ApiOkResponse({ type: AbortUploadResponseDto })
  abortUpload(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.uploadsService.abortUpload(user.sub, sessionId);
  }
}
