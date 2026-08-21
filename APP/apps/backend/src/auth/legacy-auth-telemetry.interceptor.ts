import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

const LEGACY_AUTH_SUNSET = 'Mon, 30 Nov 2026 00:00:00 GMT';

@Injectable()
export class LegacyAuthTelemetryInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LegacyAuthTelemetryInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const path = request.originalUrl?.split('?')[0] ?? '';
    if (path.includes('/auth/reminder/')) {
      return next.handle();
    }
    response.setHeader('Deprecation', 'true');
    response.setHeader('Sunset', LEGACY_AUTH_SUNSET);
    this.logger.warn({
      event: 'legacy_auth_endpoint_called',
      method: request.method,
      path,
    });
    return next.handle();
  }
}
