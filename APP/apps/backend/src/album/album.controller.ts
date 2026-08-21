import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiCreatedResponse, ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  isObjectRangeNotSatisfiableError,
  parseRangeHeader,
  setPartialContentHeaders,
  setRangeNotSatisfiableHeaders,
} from '../common/range-parser';
import { AlbumService } from './album.service';
import {
  AlbumBatchDeleteResponseDto,
  AlbumDeleteResponseDto,
  AlbumManagePhotoResponseDto,
  AlbumPhotoListResponseDto,
  AlbumTagResponseDto,
  AlbumUpdateStatusResponseDto,
  AlbumUpdateTagsResponseDto,
  AlbumViewUrlResponseDto,
  DeleteAlbumPhotosDto,
  ListAlbumPhotosDto,
  UpdateAlbumTagsDto,
} from './dto/album.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('album')
@Controller('album')
export class AlbumController {
  constructor(private readonly album: AlbumService) {}
  @ApiOkResponse({ type: AlbumUpdateStatusResponseDto })
  @Get('update-status')
  updateStatus(@CurrentUser() actor: AuthenticatedUser) {
    return this.album.getUpdateStatus(actor);
  }
  @ApiCreatedResponse({ type: AlbumUpdateStatusResponseDto })
  @Post('viewed')
  viewed(@CurrentUser() actor: AuthenticatedUser) {
    return this.album.markViewed(actor);
  }
  @ApiOkResponse({ type: AlbumPhotoListResponseDto })
  @Get('photos')
  list(@Query() query: ListAlbumPhotosDto) {
    return this.album.listPhotos(query);
  }
  @ApiOkResponse({ type: AlbumTagResponseDto, isArray: true })
  @Get('tags')
  tags() {
    return this.album.listTags();
  }
  @ApiOkResponse({ type: AlbumManagePhotoResponseDto })
  @Get('photos/:photoId/manage')
  manage(@CurrentUser() actor: AuthenticatedUser, @Param('photoId') id: string) {
    return this.album.getManagePhoto(actor, id);
  }
  @ApiOkResponse({ type: AlbumUpdateTagsResponseDto })
  @Patch('photos/:photoId/tags')
  updateTags(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('photoId') id: string,
    @Body() dto: UpdateAlbumTagsDto,
  ) {
    return this.album.updateTags(actor, id, dto.tags);
  }
  @ApiOkResponse({ type: AlbumDeleteResponseDto })
  @Delete('photos/:photoId')
  delete(@CurrentUser() actor: AuthenticatedUser, @Param('photoId') id: string) {
    return this.album.softDelete(actor, id);
  }
  @ApiCreatedResponse({ type: AlbumBatchDeleteResponseDto })
  @Post('photos/batch-delete')
  deleteMany(@CurrentUser() actor: AuthenticatedUser, @Body() dto: DeleteAlbumPhotosDto) {
    return this.album.softDeleteMany(actor, dto.photoIds);
  }
  @ApiProduces('image/jpeg', 'image/png', 'image/gif', 'image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Get('photos/:photoId/thumbnail')
  async thumbnail(
    @Param('photoId') id: string,
    @Headers('if-none-match') etag: string | undefined,
    @Query('mediaTicket') mediaTicket: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.album.getThumbnail(id, etag, mediaTicket);
    response.setHeader(
      'Content-Type',
      result.photo.thumbnailStorageKey ? 'image/jpeg' : result.photo.mimeType,
    );
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.vary('Authorization');
    if (result.etag) response.setHeader('ETag', result.etag);
    if ('lastModified' in result && result.lastModified) {
      response.setHeader('Last-Modified', result.lastModified.toUTCString());
    }
    if ('notModified' in result && result.notModified) {
      response.status(304);
      return;
    }
    if (result.contentLength !== undefined) {
      response.setHeader('Content-Length', String(result.contentLength));
    }
    return new StreamableFile(result.stream);
  }
  @ApiProduces('image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @Get('photos/:photoId/content')
  async content(
    @Param('photoId') id: string,
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    let parsedRange: string | undefined;
    try {
      parsedRange = parseRangeHeader(range);
    } catch {
      const photo = await this.album.getReadablePhoto(id);
      setRangeNotSatisfiableHeaders(response, photo.size);
      return;
    }
    let result: Awaited<ReturnType<AlbumService['getContent']>>;
    try {
      result = await this.album.getContent(id, parsedRange);
    } catch (error) {
      if (isObjectRangeNotSatisfiableError(error)) {
        const photo = await this.album.getReadablePhoto(id);
        setRangeNotSatisfiableHeaders(response, photo.size);
        return;
      }
      throw error;
    }
    response.setHeader('Content-Type', result.photo.mimeType);
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'private, max-age=60');
    response.vary('Authorization');
    setPartialContentHeaders(
      response,
      parsedRange,
      result.contentRange,
      result.contentLength,
      result.photo.size,
    );
    response.once('close', () => {
      if (!response.writableEnded && !result.stream.destroyed) result.stream.destroy();
    });
    return new StreamableFile(result.stream);
  }
  @ApiOkResponse({ type: AlbumViewUrlResponseDto })
  @Get('photos/:photoId/view-url')
  viewUrl(@Param('photoId') id: string) {
    return this.album.getViewUrl(id);
  }
}
