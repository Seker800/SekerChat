import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class ReminderSecureTransportGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.NODE_ENV !== 'production') return true;
    const request = context.switchToHttp().getRequest<Request>();
    if (request.secure) return true;
    throw new ForbiddenException('Reminder device credentials require HTTPS.');
  }
}
