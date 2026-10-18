import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { QqBridgeConnector } from '@prisma/client';
import { QqBridgeAccessService } from './qq-bridge-access.service';

export type BridgeRequest = Request & { connector: QqBridgeConnector };
@Injectable()
export class QqBridgeGuard implements CanActivate {
  constructor(private readonly access: QqBridgeAccessService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<BridgeRequest>();
    request.connector = await this.access.authenticate(request.headers.authorization);
    return true;
  }
}
