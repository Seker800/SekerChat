import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse } from '@nestjs/swagger';
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
import { ArtifactsService } from './artifacts.service';
import { FinalizedArtifactValueResponseDto } from '../uploads/dto/upload-response.dto';

@UseGuards(JwtAuthGuard)
@Controller('groups/:groupId/artifacts')
export class ArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  private buildContentDisposition(originalName: string): string {
    const fallbackName =
      originalName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
    const encodedName = encodeURIComponent(originalName)
      .replace(/['()]/g, escape)
      .replace(/\*/g, '%2A');
    return `attachment; filename="${fallbackName}"; filename*=UTF-8''${encodedName}`;
  }

  @Get()
  listArtifacts(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.artifactsService.listArtifacts(user.sub, groupId);
  }

  @Post('confirm')
  confirmArtifacts(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.artifactsService.confirmArtifacts(user.sub, groupId);
  }

  @Post('from-files/:fileId')
  @ApiCreatedResponse({ type: FinalizedArtifactValueResponseDto })
  addFileToArtifacts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.artifactsService.addFileToArtifacts(user.sub, groupId, fileId);
  }

  @Delete('confirm')
  @HttpCode(200)
  unlockArtifacts(@CurrentUser() user: AuthenticatedUser, @Param('groupId') groupId: string) {
    return this.artifactsService.unlockArtifacts(user.sub, groupId);
  }

  @Get(':artifactId')
  getArtifactMetadata(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('artifactId') artifactId: string,
  ) {
    return this.artifactsService.getArtifactMetadata(user.sub, groupId, artifactId);
  }

  @Get(':artifactId/download-url')
  async getArtifactDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('artifactId') artifactId: string,
  ) {
    const result = await this.artifactsService.getArtifactDownloadUrl(
      user.sub,
      groupId,
      artifactId,
    );
    return {
      url: result.url,
      originalName: result.artifact.originalName,
      mimeType: result.artifact.mimeType,
      size: Number(result.artifact.size),
    };
  }

  @Get(':artifactId/content')
  async getArtifactContent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('artifactId') artifactId: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    let range: string | undefined;
    try {
      range = parseRangeHeader(rangeHeader);
    } catch {
      // Fetch metadata first so the 416 Content-Range carries the real artifact size.
      const artifactMeta = await this.artifactsService.getArtifactMetadata(
        user.sub,
        groupId,
        artifactId,
      );
      setRangeNotSatisfiableHeaders(response, Number(artifactMeta.size));
      return;
    }

    let result: Awaited<ReturnType<ArtifactsService['getArtifactStream']>>;
    try {
      result = await this.artifactsService.getArtifactStream(user.sub, groupId, artifactId, range);
    } catch (error) {
      if (error instanceof RangeNotSatisfiableException) {
        setRangeNotSatisfiableHeaders(response, error.fullSize);
        return;
      }
      throw error;
    }

    const { artifact, stream, contentLength, contentRange } = result;

    response.setHeader('Content-Type', artifact.mimeType);
    response.setHeader('Content-Disposition', this.buildContentDisposition(artifact.originalName));
    setPartialContentHeaders(response, range, contentRange, contentLength, Number(artifact.size));

    response.setHeader('Cache-Control', 'private, max-age=60');

    return new StreamableFile(stream);
  }

  @Delete(':artifactId')
  deleteArtifact(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId') groupId: string,
    @Param('artifactId') artifactId: string,
  ) {
    return this.artifactsService.deleteArtifact(user, groupId, artifactId);
  }
}
