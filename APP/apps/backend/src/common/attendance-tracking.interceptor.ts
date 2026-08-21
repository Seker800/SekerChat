import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request } from 'express';
import { AttendanceService } from '../attendance/attendance.service';

type AttendanceTrackingRequest = Request & {
  user?: {
    sub?: string;
    actorType?: 'AGENT_BOT' | 'CLI_BOT' | 'HUMAN';
  };
};

@Injectable()
export class AttendanceTrackingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AttendanceTrackingInterceptor.name);

  constructor(private readonly attendanceService: AttendanceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<AttendanceTrackingRequest>();
    const response = http.getResponse<{ statusCode: number }>();

    return next.handle().pipe(
      tap(() => {
        if (response.statusCode < 200 || response.statusCode >= 400) {
          return;
        }

        void this.attendanceService.recordManualAction(request).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'unknown error';
          this.logger.error(
            `Failed to record attendance action for ${request.method} ${request.originalUrl}`,
            JSON.stringify({
              userId: request.user?.sub ?? null,
              actorType: request.user?.actorType ?? null,
              message,
            }),
          );
        });
      }),
    );
  }
}
