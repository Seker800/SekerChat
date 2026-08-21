import {
  Body,
  Controller,
  Get,
  Head,
  Headers,
  HttpException,
  Logger,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import {
  parseRangeHeader,
  RangeNotSatisfiableException,
  setPartialContentHeaders,
  setRangeNotSatisfiableHeaders,
} from '../common/range-parser';
import { FileShareAttemptLimiterService } from './file-share-attempt-limiter.service';
import { FileShareCredentialsService } from './file-share-credentials.service';
import { FileSharesService } from './file-shares.service';
import { PUBLIC_FILE_SHARE_PASSWORD_PATTERN } from './file-share-password-policy';

const COOKIE_NAME = 'seker_file_share';

function headerValue(value: unknown): string {
  if (Array.isArray(value)) return String(value.at(-1) ?? '');
  return typeof value === 'string' ? value : '';
}

interface PublicShareThrottleRequest {
  ip?: unknown;
  socket?: { remoteAddress?: unknown };
}

export function publicShareThrottleTracker(request: PublicShareThrottleRequest): string {
  return String(request.ip ?? request.socket?.remoteAddress ?? 'unknown').trim() || 'unknown';
}

class UnlockFileShareDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  @Matches(PUBLIC_FILE_SHARE_PASSWORD_PATTERN)
  password!: string;
}

function cookieValue(request: Request, name: string): string {
  const pair = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!pair) return '';
  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return '';
  }
}

function disposition(fileName: string): string {
  const fallback = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, escape).replace(/\*/g, '%2A');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function setPrivateNoStoreHeaders(response: Response): void {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Vary', 'Cookie');
}

@Controller('public/file-shares')
export class PublicFileSharesController {
  private readonly logger = new Logger(PublicFileSharesController.name);
  private readonly secureCookie: boolean;

  constructor(
    private readonly fileSharesService: FileSharesService,
    private readonly credentials: FileShareCredentialsService,
    private readonly attempts: FileShareAttemptLimiterService,
    configService: ConfigService,
  ) {
    this.secureCookie = configService.getOrThrow<string>('APP_BASE_URL').startsWith('https://');
  }

  @Post('unlock')
  @Throttle({
    default: {
      ttl: 15 * 60_000,
      limit: 30,
      getTracker: publicShareThrottleTracker,
    },
  })
  async unlock(
    @Body() body: UnlockFileShareDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    setPrivateNoStoreHeaders(response);
    const shareTokenHash = this.credentials.hashToken(body.token);
    const key = {
      shareTokenHash,
      clientFingerprint: this.credentials.fingerprintClientAddress(request.ip ?? 'unknown'),
    };
    const requestId = this.resolveRequestId(request);
    const shareRef = shareTokenHash.slice(0, 12);
    response.setHeader('X-Request-Id', requestId);
    try {
      await this.attempts.assertAllowed(key);
      const result = await this.fileSharesService.unlock(body.token, body.password);
      await this.attempts.reset(key);
      response.cookie(COOKIE_NAME, result.session, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.secureCookie,
        path: `/api/public/file-shares/${result.shareId}`,
        maxAge: 15 * 60_000,
      });
      this.logger.log('public_file_share_unlock_succeeded', JSON.stringify({
        shareId: result.shareId.slice(0, 8),
        shareRef,
        requestId,
        result: 'success',
      }));
      return {
        shareId: result.shareId,
        fileName: result.fileName,
        mimeType: result.mimeType,
        size: result.size,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        await this.attempts.recordFailure(key);
        this.logger.warn('public_file_share_unlock_rejected', JSON.stringify({
          shareId: null,
          shareRef,
          requestId,
          result: 'invalid_credentials',
        }));
      } else if (error instanceof HttpException && error.getStatus() === 429) {
        this.logger.warn('public_file_share_unlock_rejected', JSON.stringify({
          shareId: null,
          shareRef,
          requestId,
          result: 'rate_limited',
        }));
      }
      throw error;
    }
  }

  private resolveRequestId(request: Request): string {
    const supplied = headerValue(request.headers['x-request-id']).trim();
    return supplied && supplied.length <= 128 ? supplied : randomUUID();
  }

  @Head(':shareId/content')
  async head(
    @Param('shareId') shareId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    setPrivateNoStoreHeaders(response);
    const metadata = await this.fileSharesService.getPublicFileMetadata(
      shareId,
      cookieValue(request, COOKIE_NAME),
    );
    response.setHeader('Content-Type', metadata.mimeType);
    response.setHeader('Content-Length', metadata.size.toString());
    response.setHeader('Content-Disposition', disposition(metadata.fileName));
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }

  @Get(':shareId/content')
  async content(
    @Param('shareId') shareId: string,
    @Req() request: Request,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    setPrivateNoStoreHeaders(response);
    const session = cookieValue(request, COOKIE_NAME);
    let range: string | undefined;
    try {
      range = parseRangeHeader(rangeHeader);
    } catch {
      const metadata = await this.fileSharesService.getPublicFileMetadata(shareId, session);
      setRangeNotSatisfiableHeaders(response, Number(metadata.size));
      return;
    }

    try {
      const result = await this.fileSharesService.getPublicFileContent(shareId, session, range);
      response.setHeader('Content-Type', result.mimeType);
      response.setHeader('Content-Disposition', disposition(result.fileName));
      response.setHeader('X-Content-Type-Options', 'nosniff');
      setPartialContentHeaders(
        response,
        range,
        result.contentRange,
        result.contentLength,
        Number(result.size),
      );
      return new StreamableFile(result.stream);
    } catch (error) {
      if (error instanceof RangeNotSatisfiableException) {
        setRangeNotSatisfiableHeaders(response, error.fullSize);
        return;
      }
      throw error;
    }
  }
}
