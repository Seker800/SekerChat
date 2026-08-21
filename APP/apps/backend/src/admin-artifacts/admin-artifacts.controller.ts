import {
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
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
import { ArtifactsService } from '../artifacts/artifacts.service';

@UseGuards(JwtAuthGuard)
@Controller('admin/artifacts')
export class AdminArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  private buildContentDisposition(originalName: string): string {
    const fallbackName = originalName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
    const encodedName = encodeURIComponent(originalName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
    return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('query') query?: string,
    @Query('groupId') groupId?: string,
    @Query('uploaderId') uploaderId?: string,
    @Query('groupWorkStatus') groupWorkStatus?: string,
    @Query('packedState') packedState?: 'packed' | 'unpacked',
  ) {
    return this.artifactsService.listArtifactsForAdmin(user, { query, groupId, uploaderId, groupWorkStatus, packedState });
  }

  @Get(':artifactId')
  getMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Param('artifactId') artifactId: string,
  ) {
    return this.artifactsService.getArtifactMetadataForAdmin(user, artifactId);
  }

  @Get(':artifactId/download-url')
  async getDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('artifactId') artifactId: string,
  ) {
    const result = await this.artifactsService.getArtifactDownloadUrlForAdmin(user, artifactId);
    return { url: result.url, originalName: result.artifact.originalName, mimeType: result.artifact.mimeType, size: Number(result.artifact.size) };
  }

  @Get(':artifactId/content')
  async getContent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('artifactId') artifactId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    let range: string | undefined;
    try {
      range = parseRangeHeader(rangeHeader);
    } catch {
      // Fetch metadata first so the 416 Content-Range carries the real artifact size.
      const artifactMeta = await this.artifactsService.getArtifactMetadataForAdmin(user, artifactId);
      setRangeNotSatisfiableHeaders(response, Number(artifactMeta.size));
      return;
    }

    let result: Awaited<ReturnType<ArtifactsService['getArtifactStreamForAdmin']>>;
    try {
      result = await this.artifactsService.getArtifactStreamForAdmin(
        user,
        artifactId,
        range,
      );
    } catch (error) {
      if (error instanceof RangeNotSatisfiableException) {
        setRangeNotSatisfiableHeaders(response, error.fullSize);
        return;
      }
      throw error;
    }

    const { artifact, stream, contentLength, contentRange } = result;

    response.setHeader('Content-Type', artifact.mimeType);
    response.setHeader(
      'Content-Disposition',
      this.buildContentDisposition(artifact.originalName),
    );
    setPartialContentHeaders(response, range, contentRange, contentLength, Number(artifact.size));

    response.setHeader('Cache-Control', 'private, max-age=60');

    return new StreamableFile(stream);
  }

  @Delete(':artifactId')
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('artifactId') artifactId: string,
  ) {
    return this.artifactsService.deleteArtifactForAdmin(user, artifactId);
  }
}
