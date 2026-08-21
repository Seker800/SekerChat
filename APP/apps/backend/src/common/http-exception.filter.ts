import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionLoggingFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionLoggingFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { user?: { sub?: string } }>();
    const response = context.getResponse<Response>();
    const requestId = this.resolveRequestId(request);

    const status = exception instanceof HttpException
      ? exception.getStatus()
      : this.isMulterFileSizeError(exception)
        ? HttpStatus.PAYLOAD_TOO_LARGE
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const isProduction = process.env.NODE_ENV === 'production';
    const rawPayload = exception instanceof HttpException
      ? this.sanitizeResponse(exception.getResponse(), isProduction)
      : this.isMulterFileSizeError(exception)
        ? { message: '上传分片过大，请重试。' }
        : { message: 'Internal server error' };
    const payload = this.buildErrorPayload(status, rawPayload, exception, requestId, isProduction);
    const message = this.extractMessage(payload, exception);

    if (status === HttpStatus.INTERNAL_SERVER_ERROR && exception instanceof Error) {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
        exception.stack ?? exception.message,
        JSON.stringify({
          requestId,
          code: payload.code,
          userId: request.user?.sub ?? null,
          ip: request.ip,
          message,
        }),
      );
    } else {
      this.logger.error(
        `${request.method} ${request.originalUrl} -> ${status}`,
        JSON.stringify({
          requestId,
          code: payload.code,
          userId: request.user?.sub ?? null,
          ip: request.ip,
          message,
        }),
      );
    }

    response.setHeader('X-Request-Id', requestId);
    response.status(status).json(payload);
  }

  private extractMessage(payload: unknown, exception: unknown): string {
    if (typeof payload === 'string') {
      return payload;
    }

    if (payload && typeof payload === 'object' && 'message' in payload) {
      const value = (payload as { message?: unknown }).message;
      if (Array.isArray(value)) {
        return value.join('; ');
      }
      if (typeof value === 'string') {
        return value;
      }
    }

    return exception instanceof Error ? exception.message : 'Unknown error';
  }

  private buildErrorPayload(
    status: number,
    response: unknown,
    exception: unknown,
    requestId: string,
    isProduction: boolean,
  ): { statusCode: number; code: string; message: string | string[]; requestId: string } {
    return {
      statusCode: this.extractStatusCode(status, response),
      code: this.extractCode(response) ?? this.classifyError(status, response, exception),
      message: this.resolvePublicMessage(status, response, exception, isProduction),
      requestId,
    };
  }

  private extractStatusCode(status: number, response: unknown): number {
    if (response && typeof response === 'object') {
      const value = (response as { statusCode?: unknown }).statusCode;
      if (typeof value === 'number') return value;
    }
    return status;
  }

  private extractCode(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const value = (response as { code?: unknown; errorCode?: unknown }).code
      ?? (response as { errorCode?: unknown }).errorCode;
    return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
  }

  private resolvePublicMessage(
    status: number,
    response: unknown,
    exception: unknown,
    isProduction: boolean,
  ): string | string[] {
    if (isProduction && status >= 500) {
      return '服务器内部错误';
    }

    if (typeof response === 'string' && response.trim()) {
      return response.trim();
    }

    if (response && typeof response === 'object' && 'message' in response) {
      const value = (response as { message?: unknown }).message;
      if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        return isProduction ? '请求参数无效' : value;
      }
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    if (!isProduction && exception instanceof Error && exception.message.trim()) {
      return exception.message.trim();
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      return '登录状态已失效，请重新登录。';
    }
    if (status >= 500) {
      return 'Internal server error';
    }
    return 'Request failed';
  }

  private classifyError(status: number, response: unknown, exception: unknown): string {
    if (status >= 500) {
      return this.classifyServerError(exception);
    }

    const message = this.extractMessage(response, exception);
    if (status === HttpStatus.BAD_REQUEST) {
      return Array.isArray((response as { message?: unknown })?.message) ? 'VALIDATION_ERROR' : 'BAD_REQUEST';
    }
    if (status === HttpStatus.UNAUTHORIZED) return 'UNAUTHORIZED';
    if (status === HttpStatus.FORBIDDEN) {
      return message === 'Group access denied.' ? 'GROUP_ACCESS_DENIED' : 'FORBIDDEN';
    }
    if (status === HttpStatus.NOT_FOUND) return 'NOT_FOUND';
    if (status === HttpStatus.CONFLICT) return 'CONFLICT';
    if (status === HttpStatus.PAYLOAD_TOO_LARGE) return 'PAYLOAD_TOO_LARGE';
    if (status === HttpStatus.TOO_MANY_REQUESTS) return 'RATE_LIMITED';

    return `HTTP_${status}`;
  }

  private isMulterFileSizeError(exception: unknown): boolean {
    return exception instanceof Error
      && exception.name === 'MulterError'
      && (exception as { code?: unknown }).code === 'LIMIT_FILE_SIZE';
  }

  private classifyServerError(exception: unknown): string {
    if (!(exception instanceof Error)) {
      return 'INTERNAL_ERROR';
    }

    const errorName = exception.constructor.name;
    const code = (exception as { code?: unknown }).code;
    const errorText = `${errorName} ${typeof code === 'string' ? code : ''} ${exception.message}`;

    if (/P1001|P1002|P1017|Can't reach database|database server|Timed out fetching a new connection/i.test(errorText)) {
      return 'DATABASE_UNAVAILABLE';
    }
    if (/P2021|P2022|relation .* does not exist|column .* does not exist|table .* does not exist/i.test(errorText)) {
      return 'DATABASE_SCHEMA_MISMATCH';
    }
    if (/PrismaClientInitializationError|PrismaClientKnownRequestError|PrismaClientUnknownRequestError/i.test(errorText)) {
      return 'DATABASE_ERROR';
    }
    if (/configuration key|Config|environment variable|Missing config/i.test(errorText)) {
      return 'CONFIG_MISSING';
    }
    if (/S3|NoSuchBucket|NoSuchKey|ECONNREFUSED|ENOTFOUND|object storage/i.test(errorText)) {
      return 'OBJECT_STORAGE_ERROR';
    }

    return 'INTERNAL_ERROR';
  }

  private resolveRequestId(request: Request): string {
    const header = request.headers['x-request-id'];
    if (Array.isArray(header)) {
      return header.find((value) => value.trim()) ?? randomUUID();
    }
    if (typeof header === 'string' && header.trim()) {
      return header.trim();
    }
    return randomUUID();
  }

  private sanitizeResponse(response: unknown, isProduction: boolean): unknown {
    if (!isProduction) return response;

    if (typeof response === 'string') return { message: response };
    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      const message = obj.message;
      if (Array.isArray(message) && message.every((m) => typeof m === 'string')) {
        return { message: '请求参数无效', statusCode: obj.statusCode };
      }
      const statusCode = obj.statusCode;
      if (typeof statusCode === 'number' && statusCode >= 500) {
        return { message: '服务器内部错误', statusCode };
      }
    }
    return response;
  }
}
