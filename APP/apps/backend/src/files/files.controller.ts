import { Controller, Get, Headers, Param, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import {
  parseRangeHeader,
  RangeNotSatisfiableException,
  setPartialContentHeaders,
  setRangeNotSatisfiableHeaders,
} from '../common/range-parser';
import { FilesService } from './files.service';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import {
  FileDownloadUrlResponseDto,
  FileMetadataResponseDto,
  FileViewUrlResponseDto,
} from './dto/file-response.dto';

@UseGuards(JwtAuthGuard)
@ApiTags('files')
@Controller('groups/:groupId/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  private buildContentDisposition(type: 'inline' | 'attachment', originalName: string): string {
    const fallbackName =
      originalName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
    const encodedName = encodeURIComponent(originalName)
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');
    return `${type}; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
  }

  @Get(':fileId')
  @ApiOkResponse({ type: FileMetadataResponseDto })
  getFileMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.filesService.getFileMetadata(user.sub, groupId, fileId);
  }

  @Get(':fileId/thumbnail')
  @ApiProduces('image/jpeg', 'image/png', 'image/gif', 'image/webp')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async getFileThumbnail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('fileId') fileId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.filesService.getThumbnailStream(
      user.sub,
      groupId,
      fileId,
      ifNoneMatch,
    );
    const { file } = result;

    response.setHeader('Content-Type', file.thumbnailStorageKey ? 'image/jpeg' : file.mimeType);
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

  @Get(':fileId/download-url')
  @ApiOkResponse({ type: FileDownloadUrlResponseDto })
  async getFileDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('fileId') fileId: string,
  ) {
    const { file, url } = await this.filesService.createFileDownloadUrl(user.sub, groupId, fileId);
    return {
      url,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: Number(file.size),
    };
  }

  @Get(':fileId/view-url')
  @ApiOkResponse({ type: FileViewUrlResponseDto })
  async getFileViewUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('fileId') fileId: string,
  ) {
    const { file, url, expiresAt } = await this.filesService.createFileViewUrl(
      user.sub,
      groupId,
      fileId,
    );
    return { url, mimeType: file.mimeType, size: Number(file.size), expiresAt };
  }

  @Get(':fileId/content')
  @ApiProduces('application/octet-stream')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async getFileContent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('fileId') fileId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    let range: string | undefined;
    try {
      range = parseRangeHeader(rangeHeader);
    } catch {
      // Fetch metadata first so the 416 Content-Range carries the real file size.
      const fileMeta = await this.filesService.getFileMetadata(user.sub, groupId, fileId);
      setRangeNotSatisfiableHeaders(response, Number(fileMeta.size));
      return;
    }

    let result: Awaited<ReturnType<FilesService['getFileStream']>>;
    try {
      result = await this.filesService.getFileStream(user.sub, groupId, fileId, range);
    } catch (error) {
      if (error instanceof RangeNotSatisfiableException) {
        setRangeNotSatisfiableHeaders(response, error.fullSize);
        return;
      }
      throw error;
    }

    const { file, stream, contentLength, contentRange } = result;

    response.setHeader('Content-Type', file.mimeType);
    response.setHeader(
      'Content-Disposition',
      this.buildContentDisposition(
        file.mimeType.startsWith('image/') ? 'inline' : 'attachment',
        file.originalName,
      ),
    );
    setPartialContentHeaders(response, range, contentRange, contentLength, Number(file.size));

    response.setHeader('Cache-Control', 'private, max-age=60');

    return new StreamableFile(stream);
  }
}
