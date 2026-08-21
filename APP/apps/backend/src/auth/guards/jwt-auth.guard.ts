import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { JwtPayload } from '../../common/jwt-payload.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = JwtPayload>(
    err: unknown,
    user: JwtPayload | false,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    const authenticatedUser = super.handleRequest(err, user, info, context, status) as JwtPayload;
    if (!authenticatedUser.mustChangePassword) {
      return authenticatedUser as TUser;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const path = request.originalUrl.split('?')[0] ?? '';
    const canReadOwnAccount =
      request.method === 'GET' && (/\/users\/me$/.test(path) || /\/auth\/me$/.test(path));
    const canChangePassword =
      request.method === 'PATCH' && /\/auth\/(?:browser\/)?me\/password$/.test(path);

    if (!canReadOwnAccount && !canChangePassword) {
      throw new ForbiddenException('必须先修改临时密码。');
    }

    return authenticatedUser as TUser;
  }
}
