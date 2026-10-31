import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { pipeline, Transform } from 'node:stream';
import { Observable, map, tap } from 'rxjs';
import { DownloadLogService } from './download-log.service';

function resourceFromRequest(request: Request) {
  if (
    request.method !== 'GET' ||
    typeof request.route?.path !== 'string' ||
    !request.route.path.endsWith('/content')
  )
    return null;
  for (const [parameter, resourceKind] of [
    ['fileId', 'file'],
    ['artifactId', 'artifact'],
    ['attachmentId', 'article_attachment'],
    ['photoId', 'album_photo'],
    ['shareId', 'public_share'],
  ] as const) {
    const id = request.params[parameter];
    if (typeof id === 'string')
      return {
        resourceKind,
        resourceId:
          resourceKind === 'public_share' ? createHash('sha256').update(id).digest('hex') : id,
        groupId: request.params.groupId ?? null,
      };
  }
  return null;
}

@Injectable()
export class DownloadLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logs: DownloadLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { sub?: string } }>();
    const resource = resourceFromRequest(request);
    if (!resource) return next.handle();
    const response = http.getResponse<Response>();
    const startedAt = new Date().toISOString();
    const started = performance.now();
    const requestedId = request.headers['x-download-id'];
    const downloadId =
      typeof requestedId === 'string' &&
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestedId)
        ? requestedId
        : randomUUID();
    const identity = {
      downloadId,
      userId: request.user?.sub ?? null,
      ...resource,
      startedAt,
      source: 'server',
    };
    let bytes = 0;
    let firstByteMs: number | null = null;
    let lastByteMs: number | null = null;
    let maxGapMs = 0;
    let settled = false;
    let stopStream: (() => void) | undefined;
    response.setHeader('X-Download-Id', downloadId);
    this.logs.record({ ...identity, event: 'started' });
    const finish = (event: string, errorCode?: string) => {
      if (settled) return;
      settled = true;
      response.removeListener('finish', onFinish);
      response.removeListener('close', onClose);
      const elapsedMs = Math.max(0, Math.round(performance.now() - started));
      const length = response.getHeader('content-length');
      const expectedBytes =
        length !== undefined && Number.isSafeInteger(Number(length)) ? Number(length) : null;
      const transferMs = firstByteMs === null ? 0 : elapsedMs - firstByteMs;
      this.logs.record({
        ...identity,
        event,
        bytes,
        expectedBytes,
        elapsedMs,
        firstByteMs,
        maxGapMs: Math.max(maxGapMs, lastByteMs === null ? 0 : elapsedMs - lastByteMs),
        averageBytesPerSecond: transferMs > 0 ? Math.round((bytes * 1000) / transferMs) : null,
        statusCode: response.statusCode,
        partial: response.statusCode === 206,
        errorCode: errorCode ?? null,
      });
    };
    const onFinish = () => {
      const length = response.getHeader('content-length');
      if (response.statusCode >= 400) finish('failed', `http_${response.statusCode}`);
      else if (response.statusCode === 304) finish('not_modified');
      else if (
        length !== undefined &&
        Number.isSafeInteger(Number(length)) &&
        bytes !== Number(length)
      )
        finish('failed', 'incomplete_stream');
      else finish('completed');
    };
    const onClose = () => {
      if (!response.writableFinished) {
        finish('cancelled');
        stopStream?.();
      }
    };
    response.once('finish', onFinish);
    response.once('close', onClose);
    return next.handle().pipe(
      map((result: unknown) => {
        if (!(result instanceof StreamableFile)) return result;
        const source = result.getStream();
        if (settled && !response.writableFinished) {
          source.destroy();
          return result;
        }
        const meter = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            const elapsed = Math.max(0, Math.round(performance.now() - started));
            if (chunk.length > 0) {
              firstByteMs ??= elapsed;
              if (lastByteMs !== null) maxGapMs = Math.max(maxGapMs, elapsed - lastByteMs);
              lastByteMs = elapsed;
              bytes += chunk.length;
            }
            callback(null, chunk);
          },
        });
        stopStream = () => {
          source.destroy();
          meter.destroy();
        };
        pipeline(source, meter, (error) => {
          if (error) finish('failed', 'stream_error');
        });
        return new StreamableFile(meter, result.options)
          .setErrorHandler(result.errorHandler)
          .setErrorLogger(result.errorLogger);
      }),
      tap({
        error: (error: unknown) =>
          finish(
            'failed',
            error instanceof HttpException ? `http_${error.getStatus()}` : 'handler_error',
          ),
      }),
    );
  }
}
