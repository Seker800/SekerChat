import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { enforceTrustedOriginForCookieAuth } from '../request-origin';

@Injectable()
export class BrowserOriginGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): true {
    enforceTrustedOriginForCookieAuth(
      context.switchToHttp().getRequest<Request>(),
      this.configService.getOrThrow<string>('APP_BASE_URL'),
      'browser-auth-request',
    );
    return true;
  }
}
