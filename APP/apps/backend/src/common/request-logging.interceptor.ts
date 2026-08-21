import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';

type LoggedRequestSummary = { route: string };

export function summarizeLoggedRequest(
  request: Pick<Request, 'originalUrl'> & {
    baseUrl?: string;
    route?: { path?: unknown };
  },
): LoggedRequestSummary {
  const url = new URL(request.originalUrl, 'http://localhost');
  const routePath = typeof request.route?.path === 'string' ? request.route.path : null;
  const route = routePath
    ? routePath.startsWith('/')
      ? routePath
      : `${request.baseUrl ?? ''}/${routePath}`
    : url.pathname;
  return { route };
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { user?: { sub?: string; actorType?: 'AGENT_BOT' | 'CLI_BOT' | 'HUMAN' } }
    >();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();
    const requestSummary = summarizeLoggedRequest(request);

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${request.method} ${requestSummary.route} -> ${response.statusCode}`,
          JSON.stringify({
            userId: request.user?.sub ?? null,
            durationMs: Date.now() - startedAt,
            ip: request.ip,
          }),
        );
      }),
    );
  }
}
